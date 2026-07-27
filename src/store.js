// Tiny external store bridging vault state -> React (useSyncExternalStore).
// The RPC server starts before React mounts, so events can never be missed.
// Secrets never enter this store: the unlocked wallet stays in session.js
// closure; React only learns {unlocked, address}.
import * as session from './session.js'
import { getPhrase, setPhrase } from './phrase.js'

let state = {
  mode: 'standalone',
  origin: null,
  activity: [],
  session: { haveJwt: false, unlocked: false, address: null },
  // The one request awaiting the user, or null. {kind, payload} only — its
  // resolve/reject live in approve.js, outside anything React can touch.
  request: null,
  lang: 'en',
  phrase: getPhrase(), // anti-phishing phrase for this device (may be '')
}
const subs = new Set()

export const getState = () => state
export function subscribe(cb) {
  subs.add(cb)
  return () => subs.delete(cb)
}

function set(patch) {
  state = { ...state, ...patch }
  subs.forEach((cb) => cb())
}

export function initStore(mode, lang) {
  set({ mode, lang })
}

export function setStoreLang(lang) {
  set({ lang })
}

export function savePhrase(p) {
  const v = setPhrase(p)
  if (v) set({ phrase: v })
  return v
}

// Also the keeper's change hook: adopting a key or relocking happens outside
// React, and the store must stay truthful for whatever renders next.
export function refreshSession() {
  set({ session: { haveJwt: session.hasJwt(), unlocked: session.isUnlocked(), address: session.address() } })
}

export function setRequest(request) {
  set({ request })
}

export function onRpcEvent(ev) {
  if (ev.type === 'connected') set({ origin: ev.origin })
  else if (ev.type === 'request' || ev.type === 'refused') {
    set({ activity: [...state.activity, ev].slice(-20) })
  }
}
