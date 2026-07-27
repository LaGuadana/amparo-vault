// The vault's side of the dashboard <-> vault protocol (see PROTOCOL.md).
//
// Trust boundary rules, all of which live in THIS file so they can be audited
// in one sitting:
//   1. The only window-level message accepted is the handshake `hello`, and
//      only when BOTH its event.origin passes origins.js AND its event.source
//      is the window that opened/embeds us. Everything else is ignored.
//   2. The reply (`hello-ack`) is posted with the sender's exact origin as
//      targetOrigin — never '*' — and transfers one end of a dedicated
//      MessageChannel. All requests flow over that private port afterwards;
//      the vault never acts on further window-level messages.
//   3. Each hello nonce is answered at most once (a MessagePort can only be
//      transferred once; replaying a nonce must not mint extra channels).
//   4. Signing requests are popup-only (an iframe has no URL bar the user can
//      check, so it gets no trust decisions), single-flight, and rate-limited.
//      Approving each one requires a click INSIDE the vault popup — that click
//      is the user-gesture requirement; the dashboard cannot fabricate it.
import { isAllowedDashboardOrigin } from './origins.js'

export const PROTOCOL_VERSION = 1

// How this document was reached decides what it may be asked to do.
export function detectMode(win = window) {
  if (win.opener) return 'popup'
  try {
    if (win.parent && win.parent !== win) return 'iframe'
  } catch {
    return 'iframe' // cross-origin parent access can throw; that IS an iframe
  }
  return 'standalone'
}

// Kinds that produce a signature (or otherwise touch the key), and the
// interactive account flows (login/onboarding/deletion — the screens where
// secrets are typed). Both classes get the same popup-only, single-flight,
// rate-limited treatment: anything involving the user's trust happens in a
// window with a real URL bar, one thing at a time.
export const SIGNING_KINDS = new Set(['sign_typed', 'sign_tx', 'sign_message'])
export const INTERACTIVE_KINDS = new Set(['login', 'setup_wallet', 'confirm_delete'])
const POPUP_KINDS = new Set([...SIGNING_KINDS, ...INTERACTIVE_KINDS])

// Rolling-window rate limits. Signing is deliberately generous enough for a
// legitimate multi-step flow (bridge = approve + deposit + venue deposit) but
// far below "drain a wallet while the user isn't looking" cadence — and every
// signature still needs its own click in the popup regardless.
const LIMITS = {
  sign: { max: 30, windowMs: 5 * 60_000 },
  other: { max: 120, windowMs: 60_000 },
}

function makeBucket({ max, windowMs }) {
  const stamps = []
  return () => {
    const now = Date.now()
    while (stamps.length && now - stamps[0] > windowMs) stamps.shift()
    if (stamps.length >= max) return false
    stamps.push(now)
    return true
  }
}

const err = (code, message) => ({ code, message })

// start({ handlers, onEvent }) wires the handshake listener and returns a
// small controller. `handlers` maps kind -> async (payload, ctx) => result.
// `onEvent` feeds the UI ({type: 'connected'|'request'|'refused', ...}).
export function start({ handlers = {}, onEvent = () => {}, win = window } = {}) {
  const mode = detectMode(win)
  const takeSign = makeBucket(LIMITS.sign)
  const takeOther = makeBucket(LIMITS.other)
  const ackedNonces = new Set()
  let pinnedOrigin = null // first valid hello wins for this document's lifetime
  let signInFlight = false

  async function dispatch(msg, port, origin) {
    const { id, kind, payload } = msg
    const refuse = (code, message) => {
      onEvent({ type: 'refused', kind, code })
      port.postMessage({ id, ok: false, error: err(code, message) })
    }

    if (POPUP_KINDS.has(kind)) {
      // Guard order matters: mode is a hard property of the document, busy and
      // rate-limit are session state, and only then do we look for a handler.
      if (mode !== 'popup') {
        return refuse('popup_required', 'Signing is only available in the vault popup (real URL bar), never in an embedded frame.')
      }
      if (signInFlight) {
        return refuse('busy', 'Another request is already awaiting your decision in the vault.')
      }
      if (!takeSign()) {
        return refuse('rate_limited', 'Too many signing requests; slow down.')
      }
    } else if (!takeOther()) {
      return refuse('rate_limited', 'Too many requests; slow down.')
    }

    const handler = handlers[kind]
    if (!handler) {
      return refuse('not_implemented', `The vault does not implement "${kind}".`)
    }

    onEvent({ type: 'request', kind })
    if (POPUP_KINDS.has(kind)) signInFlight = true
    try {
      const result = await handler(payload, { origin, mode })
      port.postMessage({ id, ok: true, result })
    } catch (e) {
      // Handler failures (including the user clicking Reject) come back as
      // protocol errors; the raw exception never crosses the boundary.
      port.postMessage({ id, ok: false, error: err(e?.code || 'failed', e?.message || String(e)) })
    } finally {
      if (POPUP_KINDS.has(kind)) signInFlight = false
    }
  }

  function attachPort(port, origin) {
    port.onmessage = (e) => {
      const msg = e.data
      // Shape check; anything malformed is dropped (answered only when it
      // carries an id we can address).
      if (!msg || typeof msg !== 'object' || typeof msg.kind !== 'string') return
      if (!Number.isFinite(msg.id)) return
      dispatch(msg, port, origin)
    }
    port.start?.()
  }

  function onHello(e) {
    const d = e.data
    if (!d || d.amparoVault !== PROTOCOL_VERSION || d.type !== 'hello') return
    if (typeof d.nonce !== 'string' || !d.nonce) return
    // The counterparty must be the window that opened/embeds us — a random
    // window that got a reference to this popup doesn't qualify.
    const expectedSource = mode === 'popup' ? win.opener : mode === 'iframe' ? win.parent : null
    if (!expectedSource || e.source !== expectedSource) return
    if (pinnedOrigin ? e.origin !== pinnedOrigin : !isAllowedDashboardOrigin(e.origin, win.location)) return
    if (ackedNonces.has(d.nonce)) return // hello polls repeat; answer each nonce once
    ackedNonces.add(d.nonce)
    pinnedOrigin = e.origin

    const channel = new MessageChannel()
    attachPort(channel.port1, e.origin)
    e.source.postMessage(
      { amparoVault: PROTOCOL_VERSION, type: 'hello-ack', nonce: d.nonce, vault: { version: PROTOCOL_VERSION, mode } },
      e.origin, // exact targetOrigin — never '*'
      [channel.port2],
    )
    onEvent({ type: 'connected', origin: e.origin })
  }

  win.addEventListener('message', onHello)
  return {
    mode,
    get origin() { return pinnedOrigin },
    stop: () => win.removeEventListener('message', onHello),
  }
}
