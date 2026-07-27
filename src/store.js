// Tiny external store bridging rpc events -> React (useSyncExternalStore).
// The RPC server starts before React mounts, so events can never be missed.
let state = { mode: 'standalone', origin: null, activity: [] }
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

export function initStore(mode) {
  set({ mode })
}

export function onRpcEvent(ev) {
  if (ev.type === 'connected') set({ origin: ev.origin })
  else if (ev.type === 'request' || ev.type === 'refused') {
    set({ activity: [...state.activity, ev].slice(-20) })
  }
}
