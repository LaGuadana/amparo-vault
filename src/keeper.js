// The session keeper — how the vault can auto-close its popup and still be
// unlocked for the next signature, without ever writing key material to disk.
//
// The unlocked key lives in ONE vault-origin document: a hidden keeper iframe
// the dashboard embeds. Approval popups are disposable: each one finds the
// keeper, learns "already unlocked", shows the decoded approval, asks the
// keeper to sign, and closes itself.
//
// Why this is safe even though the dashboard hosts the iframe:
//   - The keeper is vault code on the vault origin. The dashboard cannot read
//     its memory (same-origin policy) — embedding a document doesn't grant
//     access to it.
//   - Popup → keeper messages go DIRECTLY window-to-window
//     (`window.opener.frames[i].postMessage(msg, VAULT_ORIGIN)`). Indexed
//     access to `frames` is one of the few cross-origin-allowed properties, so
//     the popup can address the frame without the dashboard relaying anything.
//     postMessage is point-to-point: the dashboard is not a recipient and
//     never sees the payload or the key.
//   - `targetOrigin` is the vault origin, so if the dashboard puts some other
//     document in that frame slot the message is simply dropped. The worst a
//     hostile dashboard can do is deny service (no keeper → the popup asks for
//     the password again), never eavesdrop.
//   - Both sides check `event.origin === location.origin`; only vault-origin
//     documents can hold that origin.
//
// This channel is deliberately SEPARATE from the dashboard-facing protocol in
// rpc.js, which still refuses every signing kind from an iframe. Signing here
// is only ever performed for a vault-origin popup that has already shown the
// user what they are approving.
//
// Storage is untouched on purpose: nothing survives the dashboard tab closing
// or reloading, so a stolen device yields no key — the trade-off is that a
// reload asks for the password again, which we prefer over an at-rest secret.
import { Wallet } from 'ethers'
import { signTyped, signTx, signMessage } from './signer.js'
import { encryptSecret } from './crypto.js'

const PEER_VERSION = 1
const FIND_TIMEOUT_MS = 1200

const sameOrigin = (e) => e.origin === window.location.origin

// ---- keeper side (runs in the hidden iframe) --------------------------------

// startKeeper({ onChange }) holds the unlocked key for the dashboard tab's
// lifetime and serves vault-origin popups. onChange fires when lock state
// changes so the (invisible) UI/store stays truthful.
export function startKeeper({ onChange = () => {} } = {}) {
  let wallet = null // ethers Wallet — this document's memory only
  let boundJwt = null // the login session this key belongs to

  const state = () => ({ unlocked: !!wallet, address: wallet?.address ?? null })

  const api = {
    state: () => state(),
    // Every popup binds before trusting the session. THE account-switch guard
    // lives here rather than per-document, because each fresh popup starts
    // with no token and would otherwise read its own first `session` message
    // as a change of user and needlessly relock the tab.
    bind: ({ jwt }) => {
      if (!jwt) return state() // popup hasn't been told the session yet
      if (boundJwt && jwt !== boundJwt) {
        wallet = null
        onChange(state())
      }
      boundJwt = jwt
      return state()
    },
    adopt: ({ privateKey, jwt }) => {
      wallet = new Wallet(privateKey)
      if (jwt) boundJwt = jwt
      onChange(state())
      return state()
    },
    lock: () => {
      wallet = null
      onChange(state())
      return state()
    },
    sign: async ({ kind, payload }) => {
      if (!wallet) throw new Error('the vault session is locked')
      if (kind === 'sign_typed') return signTyped(wallet, payload.typed_data)
      if (kind === 'sign_tx') return signTx(wallet, payload.tx)
      if (kind === 'sign_message') return { flat: await signMessage(wallet, payload.message) }
      throw new Error(`unknown signing kind: ${kind}`)
    },
    // Re-wrap the held key under a new secret so the user can add another way
    // in (a phone's Face ID, a PIN) without the plaintext key ever leaving
    // this document — the popup sends the secret, not the other way round.
    wrap: ({ secret }) => {
      if (!wallet) throw new Error('the vault session is locked')
      return encryptSecret(wallet.privateKey, secret)
    },
  }

  function attach(port) {
    port.onmessage = async (e) => {
      const msg = e.data
      if (!msg || typeof msg.op !== 'string' || !Number.isFinite(msg.id)) return
      const fn = api[msg.op]
      if (!fn) return port.postMessage({ id: msg.id, ok: false, error: 'unknown op' })
      try {
        port.postMessage({ id: msg.id, ok: true, result: await fn(msg.args || {}) })
      } catch (err) {
        port.postMessage({ id: msg.id, ok: false, error: err?.message || String(err) })
      }
    }
    port.start?.()
  }

  window.addEventListener('message', (e) => {
    const d = e.data
    if (!sameOrigin(e) || !d || d.amparoVaultPeer !== PEER_VERSION || d.type !== 'peer-hello') return
    if (!e.source) return
    const channel = new MessageChannel()
    attach(channel.port1)
    e.source.postMessage(
      { amparoVaultPeer: PEER_VERSION, type: 'peer-ack', nonce: d.nonce },
      window.location.origin,
      [channel.port2],
    )
  })

  return { lock: api.lock, state }
}

// ---- popup side ------------------------------------------------------------

// findKeeper() → a client for the keeper iframe, or null if there is none
// (dashboard not open, keeper not embedded, or a hostile frame in its place).
// The popup broadcasts a nonce'd hello at every frame of its opener with the
// vault origin as targetOrigin; only the real keeper can receive it and only
// vault code can answer.
export function findKeeper() {
  const opener = window.opener
  if (!opener) return Promise.resolve(null)
  return new Promise((resolve) => {
    const nonce = crypto.getRandomValues(new Uint32Array(4)).join('-')
    let done = false
    let finish = (client) => {
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener('message', onAck)
      resolve(client)
    }

    const onAck = (e) => {
      const d = e.data
      if (!sameOrigin(e) || !d || d.amparoVaultPeer !== PEER_VERSION) return
      if (d.type !== 'peer-ack' || d.nonce !== nonce) return
      const port = e.ports?.[0]
      if (!port) return
      const pending = new Map()
      let nextId = 1
      port.onmessage = (ev) => {
        const m = ev.data
        const p = m && pending.get(m.id)
        if (!p) return
        pending.delete(m.id)
        m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || 'keeper failed'))
      }
      port.start?.()
      const call = (op, args) => new Promise((res, rej) => {
        const id = nextId++
        pending.set(id, { resolve: res, reject: rej })
        port.postMessage({ id, op, args })
      })
      finish({
        state: () => call('state'),
        bind: (jwt) => call('bind', { jwt }),
        adopt: (privateKey, jwt) => call('adopt', { privateKey, jwt }),
        lock: () => call('lock'),
        sign: (kind, payload) => call('sign', { kind, payload }),
        wrap: (secret) => call('wrap', { secret }),
      })
    }
    window.addEventListener('message', onAck)

    // Frame count is readable cross-origin; the message only lands in a frame
    // that is actually on the vault origin. Polled rather than sent once: the
    // keeper frame may still be loading (or be added moments later), and a
    // missed hello would cost the user a needless password prompt.
    const hello = { amparoVaultPeer: PEER_VERSION, type: 'peer-hello', nonce }
    const sweep = () => {
      let frames = 0
      try { frames = opener.frames.length } catch { frames = 0 }
      for (let i = 0; i < frames; i++) {
        try { opener.frames[i].postMessage(hello, window.location.origin) } catch { /* not ours */ }
      }
    }
    sweep()
    const poll = setInterval(sweep, 120)
    const timer = setTimeout(() => { clearInterval(poll); finish(null) }, FIND_TIMEOUT_MS)
    const origFinish = finish
    finish = (client) => { clearInterval(poll); origFinish(client) }
  })
}
