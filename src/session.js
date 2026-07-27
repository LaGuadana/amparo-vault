// Vault session: the JWT, the account profile, the (encrypted) wallet blob,
// and the unlocked wallet. The wallet lives in THIS module's closure —
// deliberately not in React state, so no component tree or devtools extension
// walks into it; the UI only ever learns {unlocked, address, protector}.
//
// Secrets are typed into the vault popup (password/PIN) or released by the
// platform authenticator (passkey PRF), used for one decrypt, and never
// stored. The JWT either arrives over the channel from the dashboard (which
// holds it anyway — a bearer token for the API, not key material) or is
// minted here at login and handed TO the dashboard.
import { api, pwAuth, getApiToken, setApiToken } from './api.js'
import { unlockWallet, signTyped, signTx, signMessage } from './signer.js'
import { encryptSecret } from './crypto.js'
import { Wallet } from 'ethers'

let wallet = null // ethers Wallet, vault memory only
let blob = null   // encrypted blob cache {address, ciphertext, ..., protector, wrap_meta}
let me = null     // {email, passwordless} cache

// The keeper (keeper.js) holds the unlocked key for the dashboard tab's
// lifetime, so an approval popup can close itself and the NEXT popup still
// finds the session unlocked. `keeper` is the client held by a popup;
// `keeperState` is its last known answer. Both stay empty in a standalone tab,
// or when no keeper is reachable — then the session is popup-scoped as before.
let keeper = null
let keeperState = { unlocked: false, address: null }
let keeperReady = Promise.resolve(null) // resolves once the lookup has settled
let host = null // set in the keeper document itself (it IS the key holder)

// Adopt the tab's keeper and bind it to this popup's login session. The keeper
// answers with its lock state — already unlocked means no prompt for the user.
export async function attachKeeper(client) {
  keeper = client
  keeperState = (await client.bind(getApiToken()).catch(() => null))
    || { unlocked: false, address: null }
  return keeperState
}

// The keeper document registers itself so lock()/isUnlocked() speak for the
// key it holds rather than for a remote one.
export function attachKeeperHost(h) {
  host = h
}

// A popup defers its first request until the keeper lookup has settled,
// otherwise a signature could flash the unlock screen for a session that is
// already unlocked.
export function claimKeeper(promise) {
  keeperReady = promise.catch(() => null)
}
export const ready = () => keeperReady

export const hasJwt = () => !!getApiToken()
export const isUnlocked = () => !!wallet || keeperState.unlocked || !!host?.state().unlocked
export const address = () =>
  wallet?.address ?? keeperState.address ?? host?.state().address ?? blob?.address ?? null
export const getWallet = () => wallet

// Sign with whichever half of the session holds the key: this document if the
// user just unlocked here, otherwise the keeper. Only the signature comes back.
export async function signPayload(kind, payload) {
  if (wallet) {
    if (kind === 'sign_typed') return signTyped(wallet, payload.typed_data)
    if (kind === 'sign_tx') return signTx(wallet, payload.tx)
    return { flat: await signMessage(wallet, payload.message) }
  }
  if (keeper && keeperState.unlocked) return keeper.sign(kind, payload)
  throw Object.assign(new Error('The vault is locked.'), { code: 'locked' })
}

export function lock() {
  wallet = null
  keeperState = { unlocked: false, address: null }
  host?.lock()
  keeper?.lock().catch(() => {})
}

// A different account must never inherit the previous one's state. "Different"
// means REPLACING a session, not learning one for the first time: a fresh popup
// starts blank and is told the tab's session on connect, which is not a switch.
// The keeper enforces the same rule for the key it holds (keeper.js `bind`).
export function setJwt(next) {
  const token = next || null
  const prev = getApiToken()
  if (prev && token !== prev) {
    lock()
    blob = null
    me = null
  }
  setApiToken(token)
  if (keeper && token) {
    keeper.bind(token).then((s) => { keeperState = s }).catch(() => {})
  }
}

const fail = (code, message) => Object.assign(new Error(message), { code })

// The encrypted blob, fetched from the vault's own origin and cached for the
// session. It stays server-side between sessions — never in browser storage.
// Its `protector` field decides which unlock UI to show (0 password, 1 PIN,
// 2 passkey).
export async function fetchBlob(force = false) {
  if (!hasJwt()) throw fail('no_session', 'The dashboard has not shared a login session yet.')
  if (blob && !force) return blob
  try {
    blob = await api('/api/wallet')
  } catch (e) {
    if (e.status === 404) throw fail('no_wallet', 'No wallet exists for this account yet.')
    throw fail('wallet_fetch_failed', e.detail || `Could not fetch your wallet (HTTP ${e.status ?? '?'}).`)
  }
  return blob
}

// {email, passwordless} — which auth model this account uses.
export async function fetchMe(force = false) {
  if (!hasJwt()) throw fail('no_session', 'The dashboard has not shared a login session yet.')
  if (me && !force) return me
  const u = await api('/api/auth/me')
  me = { email: u?.email ?? null, passwordless: !!u?.passwordless }
  return me
}

// Hand the freshly unlocked key to the keeper so it outlives this popup. Fire
// and forget: with no keeper the session is simply popup-scoped, as before.
function shareWithKeeper(privateKey) {
  if (!keeper) return
  keeper.adopt(privateKey, getApiToken())
    .then((s) => { keeperState = s })
    .catch(() => {})
}

// Every way in to this wallet: one row per secret (password / PIN / passkey),
// each an independent wrapping of the same key. See app/api/wallet.py.
export const protectors = () => blob?.protectors || []

// Decrypt with ONE protector's blob and hold the key in vault memory. The
// secret is a password, a PIN, or a passkey PRF output — all feed the same KDF.
export async function unlockWithProtector(p, secret) {
  const b = await fetchBlob()
  wallet = await unlockWallet({ ...p, address: b.address }, secret)
  shareWithKeeper(wallet.privateKey)
  return { address: wallet.address }
}

// Kept for the single-protector callers: unlock with whatever the wallet's own
// blob says, as before the split.
export async function unlockWithSecret(secret) {
  const b = await fetchBlob()
  wallet = await unlockWallet(b, secret)
  shareWithKeeper(wallet.privateKey)
  return { address: wallet.address }
}

// ---- managing the ways in --------------------------------------------------
// Adding one needs the key re-wrapped under the new secret, which only an
// unlocked session can do — here if this document holds the key, otherwise in
// the keeper (the secret travels to it, never the key back).
async function wrapKeyWith(secret) {
  if (wallet) return encryptSecret(wallet.privateKey, secret)
  if (keeper && keeperState.unlocked) return keeper.wrap(secret)
  throw fail('locked', 'Unlock your wallet first.')
}

export async function addProtector({ kind, secret, wrapMeta, label, password }) {
  const wrapped = await wrapKeyWith(secret)
  const body = { kind, ...wrapped, wrap_meta: wrapMeta || null, label: label || null }
  // A password protector must prove it IS the account password (verifier).
  if (kind === 0) {
    const email = (await fetchMe()).email
    await pwAuth('/api/wallet/protectors', { email, password: secret, body })
  } else {
    await api('/api/wallet/protectors', { method: 'POST', body })
  }
  await fetchBlob(true)
  return protectors()
}

export async function removeProtector(id) {
  await api(`/api/wallet/protectors/${id}`, { method: 'DELETE' })
  await fetchBlob(true)
  return protectors()
}

// Adopt an already-unlocked key (fresh onboarding / recovery — the flows that
// legitimately hold the plaintext key for a moment).
export function adoptKey(privateKey, expectAddress) {
  const w = new Wallet(privateKey)
  if (expectAddress && w.address.toLowerCase() !== expectAddress.toLowerCase()) {
    throw new Error('key does not match the expected address')
  }
  wallet = w
  shareWithKeeper(w.privateKey)
  return { address: w.address }
}

// Fresh blob just saved (onboarding/recovery overwrites the server copy).
export function setBlobCache(b) {
  blob = b
}
