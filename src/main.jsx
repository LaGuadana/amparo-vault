import React from 'react'
import { createRoot } from 'react-dom/client'
import { start, detectMode, PROTOCOL_VERSION } from './rpc.js'
import { initStore, onRpcEvent } from './store.js'
import App from './App.jsx'
import './styles.css'

// Step-1 request handlers: liveness + capability discovery. The signing kinds
// deliberately have NO handler yet — the rpc guards still apply to them, so
// the protocol's restrictive posture is in force before any key exists here.
const mode = detectMode()
start({
  handlers: {
    ping: async () => ({ pong: true }),
    status: async () => ({ version: PROTOCOL_VERSION, mode, unlocked: false, address: null }),
  },
  onEvent: onRpcEvent,
})

initStore(mode)
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
