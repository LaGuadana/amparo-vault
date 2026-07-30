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
import { setRequest } from './store.js'

let current = null // {kind, payload, resolve, reject} — never in React state

const fail = (code, message) => Object.assign(new Error(message), { code })

// A batch is a convenience over the single kinds, never a new capability: the
// most signatures one Approve click may authorize. Kept small so the review
// screen stays a readable list, not a wall the user rubber-stamps.
const BATCH_KINDS = new Set(['sign_typed', 'sign_tx', 'sign_message'])
const MAX_BATCH = 8

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
  } else if (kind === 'sign_batch') {
    const items = payload?.items
    if (!Array.isArray(items) || items.length < 1) {
      throw fail('bad_request', 'sign_batch needs a non-empty {items: [{kind, payload}, …]}.')
    }
    if (items.length > MAX_BATCH) {
      throw fail('bad_request', `sign_batch is limited to ${MAX_BATCH} items.`)
    }
    // Each item is one of the single signing kinds — no nested batches — and
    // must pass the same structural check as if it had arrived on its own.
    for (const it of items) {
      if (!it || !BATCH_KINDS.has(it.kind)) {
        throw fail('bad_request', 'each sign_batch item must be a sign_tx / sign_typed / sign_message.')
      }
      validate(it.kind, it.payload)
    }
  }
}

// The rpc handler for each signing kind: park the request for the UI and
// settle when the user decides. rpc.js's single-flight guard guarantees at
// most one of these is pending.
export function makeSignHandler(kind) {
  return async (payload) => {
    validate(kind, payload)
    if (!session.hasJwt()) {
      throw fail('no_session', 'The dashboard has not shared a login session yet.')
    }
    // Wait for the keeper lookup so an already-unlocked session goes straight
    // to the approval screen instead of flashing the unlock prompt.
    await session.ready()
    return new Promise((resolve, reject) => {
      current = { kind, payload, resolve, reject }
      setRequest({ kind, payload })
      window.focus() // best effort — bring the vault forward for the decision
    })
  }
}

// Interactive (non-signing) flows the dashboard can ask for: login,
// setup_wallet, confirm_delete. Same parking mechanics; the matching UI flow
// drives itself and settles via resolveCurrent/rejectCurrent. Login is the one
// kind that legitimately arrives without a session (it CREATES the session).
export function makeInteractiveHandler(kind) {
  return (payload) =>
    new Promise((resolve, reject) => {
      if (kind !== 'login' && !session.hasJwt()) {
        return reject(fail('no_session', 'The dashboard has not shared a login session yet.'))
      }
      current = { kind, payload: payload || {}, resolve, reject }
      setRequest({ kind, payload: payload || {} })
      window.focus()
    })
}

// Settle the current interactive flow from its UI.
export function resolveCurrent(result) {
  if (!current) return
  const { resolve } = current
  current = null
  setRequest(null)
  resolve(result)
  scheduleClose()
}

// UI actions ------------------------------------------------------------------

export async function approveCurrent() {
  if (!current) return
  const { kind, payload, resolve, reject } = current
  if (!session.isUnlocked()) return // UI shouldn't offer Approve yet
  try {
    // signPayload signs here or in the keeper, whichever holds the key. A batch
    // signs each item IN ORDER (later txs may depend on an earlier one's nonce)
    // and returns {results:[…]} aligned to the items the screen displayed.
    let result
    if (kind === 'sign_batch') {
      const results = []
      for (const it of payload.items) results.push(await session.signPayload(it.kind, it.payload))
      result = { results }
    } else {
      result = await session.signPayload(kind, payload)
    }
    current = null
    setRequest(null)
    resolve(result) // ONLY the signature(s) cross back — never the key
    scheduleClose()
  } catch (e) {
    current = null
    setRequest(null)
    reject(fail('sign_failed', e?.message || String(e)))
    scheduleClose() // the error surfaces in the dashboard, not here
  }
}

// ---- popup auto-close ------------------------------------------------------
// A settled request should get out of the way — approve, reject, interactive
// done and signing failure all close the popup shortly after. The delay is
// long enough for the result to reach the dashboard and for a follow-up
// request in the same flow (multi-signature actions fire their next step
// within a second or two) to cancel the close. The key is not lost with the
// window: the keeper in the dashboard tab holds the session, so the next popup
// opens already unlocked.
let closeTimer = null

export function cancelAutoClose() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function scheduleClose() {
  cancelAutoClose()
  if (typeof window === 'undefined' || !window.opener) return
  closeTimer = setTimeout(() => {
    closeTimer = null
    if (!current) window.close()
  }, 1800)
}

export function rejectCurrent() {
  if (!current) return
  const { reject } = current
  current = null
  setRequest(null)
  reject(fail('rejected', 'You declined the request in the vault.'))
  scheduleClose()
}
