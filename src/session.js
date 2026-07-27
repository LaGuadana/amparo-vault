// Vault session: the JWT (to fetch the encrypted blob) and the unlocked
// wallet. The wallet lives in THIS module's closure — deliberately not in
// React state, so no component tree or devtools extension walks into it; the
// UI only ever learns {unlocked, address}.
//
// The password is typed into the vault popup, used for one decrypt, and never
// stored; the JWT arrives over the channel from the dashboard (which holds it
// anyway — it's a bearer token for the API, not key material).
import { unlockWallet } from './signer.js'

let jwt = null
let wallet = null // ethers Wallet, vault memory only

export const hasJwt = () => !!jwt
export const isUnlocked = () => !!wallet
export const address = () => wallet?.address ?? null
export const getWallet = () => wallet

export function lock() {
  wallet = null
}

// A different account logging into the dashboard must never inherit the
// previous user's unlocked key: any JWT change relocks.
export function setJwt(next) {
  const token = next || null
  if (token !== jwt) lock()
  jwt = token
}

// Fetch the encrypted blob from the vault's own origin (/api is proxied to
// the same backend the dashboard talks to) and decrypt it in vault memory.
// The blob stays server-side between sessions — never in browser storage.
export async function unlock(password) {
  if (!jwt) throw Object.assign(new Error('The dashboard has not shared a login session yet.'), { code: 'no_session' })
  const res = await fetch('/api/wallet', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (res.status === 404) throw Object.assign(new Error('No wallet exists for this account yet.'), { code: 'no_wallet' })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw Object.assign(new Error(data?.detail || `Could not fetch your wallet (HTTP ${res.status}).`), { code: 'wallet_fetch_failed' })
  }
  const blob = await res.json()
  wallet = await unlockWallet(blob, password)
  return { address: wallet.address }
}
