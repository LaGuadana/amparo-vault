// Approval orchestration: every signing request stops HERE until the user
// clicks Approve inside the vault popup. That click is the user-gesture
// requirement of the protocol; the dashboard can neither skip nor fake it.
//
// The linchpin rule (vault-architecture-plan.md): the vault signs EXACTLY the
// payload it displayed. The UI renders from the same object that goes to the
// signer, and nothing the dashboard sends besides the payload itself (no
// descriptions, no labels) is ever shown — a lying "description" field is the
// oldest wallet-phishing trick there is.
import * as session from './session.js'
import { signTyped, signTx, signMessage } from './signer.js'
import { setRequest, refreshSession } from './store.js'

let current = null // {kind, payload, resolve, reject} — never in React state

const fail = (code, message) => Object.assign(new Error(message), { code })

// Cheap structural checks so garbage fails fast with a clear code instead of
// deep inside ethers. Real semantic decoding is the approval UI's job.
function validate(kind, payload) {
  if (kind === 'sign_typed') {
    const td = payload?.typed_data
    if (!td || typeof td !== 'object' || !td.types || !td.domain || !td.message) {
      throw fail('bad_request', 'sign_typed needs {typed_data: {types, domain, message, primaryType}}.')
    }
  } else if (kind === 'sign_tx') {
    const tx = payload?.tx
    if (!tx || typeof tx !== 'object' || typeof tx.to !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(tx.to)) {
      throw fail('bad_request', 'sign_tx needs {tx} with a valid `to` address.')
    }
    if (!Number.isFinite(Number(tx.chainId))) throw fail('bad_request', 'sign_tx needs a numeric chainId.')
  } else if (kind === 'sign_message') {
    const m = payload?.message
    if (typeof m !== 'string' || !m || m.length > 10_000) {
      throw fail('bad_request', 'sign_message needs a non-empty string message (<=10k chars).')
    }
  }
}

// The rpc handler for each signing kind: park the request for the UI and
// settle when the user decides. rpc.js's single-flight guard guarantees at
// most one of these is pending.
export function makeSignHandler(kind) {
  return (payload) =>
    new Promise((resolve, reject) => {
      try {
        validate(kind, payload)
      } catch (e) {
        return reject(e)
      }
      if (!session.hasJwt()) {
        return reject(fail('no_session', 'The dashboard has not shared a login session yet.'))
      }
      current = { kind, payload, resolve, reject }
      setRequest({ kind, payload })
      window.focus() // best effort — bring the vault forward for the decision
    })
}

// UI actions ------------------------------------------------------------------

export async function approveCurrent() {
  if (!current) return
  const { kind, payload, resolve, reject } = current
  const w = session.getWallet()
  if (!w) return // still locked; UI shouldn't offer Approve yet
  try {
    let result
    if (kind === 'sign_typed') result = await signTyped(w, payload.typed_data)
    else if (kind === 'sign_tx') result = await signTx(w, payload.tx)
    else result = { flat: await signMessage(w, payload.message) }
    current = null
    setRequest(null)
    resolve(result) // ONLY the signature crosses back — never the key
  } catch (e) {
    current = null
    setRequest(null)
    reject(fail('sign_failed', e?.message || String(e)))
  }
}

export function rejectCurrent() {
  if (!current) return
  const { reject } = current
  current = null
  setRequest(null)
  reject(fail('rejected', 'You declined the request in the vault.'))
}

// Unlock with the password typed into the vault; used by the unlock screen
// shown when a signature is requested while locked.
export async function unlockWithPassword(password) {
  await session.unlock(password)
  refreshSession()
}
