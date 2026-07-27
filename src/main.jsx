import React from 'react'
import { createRoot } from 'react-dom/client'
import { start, detectMode, PROTOCOL_VERSION } from './rpc.js'
import { initStore, onRpcEvent, refreshSession, setStoreLang } from './store.js'
import { makeSignHandler, makeInteractiveHandler } from './approve.js'
import * as session from './session.js'
import { getLang, setLang } from './i18n.js'
import App from './App.jsx'
import './styles.css'

// Request handlers. Signing kinds and the interactive account flows all route
// through approve.js, which parks them on the vault UI — nothing signs, logs
// in, or is erased without the user acting in this window.
const mode = detectMode()
start({
  handlers: {
    ping: async () => ({ pong: true }),
    status: async () => ({
      version: PROTOCOL_VERSION,
      mode,
      unlocked: session.isUnlocked(),
      address: session.address(),
    }),
    // The dashboard shares its login session (the JWT is a bearer token it
    // holds anyway — never the password). A different JWT relocks the vault
    // so user B can never sign with user A's key. `lang` seeds the vault's
    // own language preference (separate origin = separate localStorage).
    session: async ({ jwt, lang } = {}) => {
      session.setJwt(jwt)
      if (lang && setLang(lang)) setStoreLang(lang)
      refreshSession()
      return { unlocked: session.isUnlocked(), address: session.address() }
    },
    sign_typed: makeSignHandler('sign_typed'),
    sign_tx: makeSignHandler('sign_tx'),
    sign_message: makeSignHandler('sign_message'),
    login: makeInteractiveHandler('login'),
    setup_wallet: makeInteractiveHandler('setup_wallet'),
    confirm_delete: makeInteractiveHandler('confirm_delete'),
  },
  onEvent: onRpcEvent,
})

initStore(mode, getLang())
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
