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
import { api, getApiToken, setApiToken } from './api.js'
import { unlockWallet } from './signer.js'
import { Wallet } from 'ethers'

let wallet = null // ethers Wallet, vault memory only
let blob = null   // encrypted blob cache {address, ciphertext, ..., protector, wrap_meta}
let me = null     // {email, passwordless} cache

export const hasJwt = () => !!getApiToken()
export const isUnlocked = () => !!wallet
export const address = () => wallet?.address ?? blob?.address ?? null
export const getWallet = () => wallet

export function lock() {
  wallet = null
}

// A different account must never inherit the previous one's state: any JWT
// change relocks and drops every per-account cache.
export function setJwt(next) {
  const token = next || null
  if (token !== getApiToken()) {
    lock()
    blob = null
    me = null
  }
  setApiToken(token)
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

// Decrypt the cached blob with a secret (password, PIN, or passkey PRF output
// — all feed the same KDF) and hold the key in vault memory.
export async function unlockWithSecret(secret) {
  const b = await fetchBlob()
  wallet = await unlockWallet(b, secret)
  return { address: wallet.address }
}

// Adopt an already-unlocked key (fresh onboarding / recovery — the flows that
// legitimately hold the plaintext key for a moment).
export function adoptKey(privateKey, expectAddress) {
  const w = new Wallet(privateKey)
  if (expectAddress && w.address.toLowerCase() !== expectAddress.toLowerCase()) {
    throw new Error('key does not match the expected address')
  }
  wallet = w
  return { address: w.address }
}

// Fresh blob just saved (onboarding/recovery overwrites the server copy).
export function setBlobCache(b) {
  blob = b
}
