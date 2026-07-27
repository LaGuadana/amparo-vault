// Vault UI shell: standalone explainer, connection status, and the screens
// each request kind walks through — login/register (auth.jsx), wallet setup
// (onboarding.jsx), protector-aware unlock (unlock.jsx), account deletion
// (delete.jsx), and the signature approval below. Everything rendered in the
// approval views is DECODED from the payload that will be signed (decode.js)
// and from nothing else (see approve.js); the raw payload is always one
// <details> away, so nothing is ever signed blind.
//
// NOTE: no inline style={} anywhere in the vault — the CSP is style-src 'self',
// which forbids style attributes. Classes only.
import { useMemo, useState, useSyncExternalStore } from 'react'
import { subscribe, getState, savePhrase } from './store.js'
import { approveCurrent, rejectCurrent, resolveCurrent } from './approve.js'
import { decodeTx, decodeTyped } from './decode.js'
import AuthFlow from './auth.jsx'
import { OnboardingFlow } from './onboarding.jsx'
import UnlockPanel from './unlock.jsx'
import DeleteFlow from './delete.jsx'
import { t } from './i18n.js'

// The brand line doubles as the anti-phishing anchor: once a phrase is set on
// this device, every real vault screen shows it — a fake vault window drawn
// by a compromised dashboard can't know it (phrase.js).
function Brand({ phrase }) {
  return (
    <div className="brandline">
      <span className="brand">amparo</span>
      <span className="tag">vault</span>
      {phrase ? <span className="phrase" title={t('Your security phrase — a window without it is not the real vault.')}>{phrase}</span> : null}
    </div>
  )
}

// One-time, non-blocking phrase setup, shown until one is chosen.
function PhraseSetup() {
  const [value, setValue] = useState('')
  return (
    <div className="phrasebox">
      <div className="dim">
        {t('Pick a security phrase for this device. The real vault will always show it up here — a fake window can’t know it.')}
      </div>
      <div className="phraserow">
        <input
          value={value}
          maxLength={40}
          placeholder={t('e.g. green teapot')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && savePhrase(value)}
        />
        <button className="ghost" disabled={!value.trim()} onClick={() => savePhrase(value)}>{t('Save')}</button>
      </div>
    </div>
  )
}

function Standalone({ phrase }) {
  return (
    <div className="wrap">
      <div className="card">
        <Brand phrase={phrase} />
        <h1>{t('This is amparo’s signing vault.')}</h1>
        <p className="dim">
          {t('The vault is a small, open-source page on its own origin. It is where your password is entered, your wallet key is unlocked, and every transaction is approved and signed. The dashboard can only ask it for signatures — your key and password never leave this origin.')}
        </p>
        <p className="dim">
          {t('You normally don’t open this page yourself: the dashboard opens it in a popup when something needs your approval. Always check the address bar reads this origin before typing your password here.')}
        </p>
      </div>
    </div>
  )
}

// ---- request flow -------------------------------------------------------------

const KIND_LABEL = {
  sign_tx: 'Transaction',
  sign_typed: 'Typed message',
  sign_message: 'Message',
}

function Rows({ rows }) {
  return (
    <>
      {rows.map((r, i) => (
        <div className="prow" key={i}>
          <div className="plabel">{r.label}</div>
          <div className="pvalue mono">{r.value}</div>
        </div>
      ))}
    </>
  )
}

function ApprovalScreen({ request, origin }) {
  const [busy, setBusy] = useState(false)
  const { kind, payload } = request

  // Decoded from the exact object approveCurrent() will sign — same reference,
  // no re-fetch, nothing dashboard-supplied besides the payload itself.
  const d = useMemo(() => {
    if (kind === 'sign_tx') return decodeTx(payload.tx, t)
    if (kind === 'sign_typed') return decodeTyped(payload.typed_data, t)
    return null // sign_message: the verbatim text IS the meaning
  }, [kind, payload])
  const raw = kind === 'sign_tx' ? payload.tx : kind === 'sign_typed' ? payload.typed_data : payload.message

  async function approve() {
    setBusy(true)
    try { await approveCurrent() } finally { setBusy(false) }
  }

  return (
    <>
      <h1>{d ? d.title : t('Signature request')}</h1>
      <div className="askedby">
        <span className="dim">{t(KIND_LABEL[kind] || kind)}</span>
        {origin ? <span className="mono dim"> · {origin}</span> : null}
      </div>
      <p className="dim">{t('Review what will be signed. Approving signs exactly what is shown here — nothing else.')}</p>
      <div className="payload">
        {d ? <Rows rows={d.rows} /> : <pre className="pjson">{String(payload.message)}</pre>}
      </div>
      {d?.warning && <div className="warnbox">{d.warning}</div>}
      <details className="rawbox">
        <summary>{t('Technical details & raw payload')}</summary>
        {d?.techRows ? <div className="payload"><Rows rows={d.techRows} /></div> : null}
        <pre className="pjson">{typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}</pre>
      </details>
      <div className="btnrow">
        <button className="primary" disabled={busy} onClick={approve}>
          {busy ? t('Signing…') : t('Approve & sign')}
        </button>
        <button className="ghost" disabled={busy} onClick={rejectCurrent}>{t('Reject')}</button>
      </div>
    </>
  )
}

// Which screen serves the pending request. Interactive flows drive themselves
// and settle via resolveCurrent/rejectCurrent; signing kinds go through
// unlock-then-approve.
function RequestScreen({ request, state }) {
  const { kind, payload } = request
  if (kind === 'login') {
    return <AuthFlow payload={payload} onDone={resolveCurrent} onCancel={rejectCurrent} />
  }
  if (kind === 'setup_wallet') {
    return <OnboardingFlow knownPassword={null} onDone={(address) => resolveCurrent({ address })} onCancel={rejectCurrent} />
  }
  if (kind === 'confirm_delete') {
    return <DeleteFlow payload={payload} />
  }
  return state.session.unlocked
    ? <ApprovalScreen request={request} origin={state.origin} />
    : <UnlockPanel />
}

function Connected({ state }) {
  const { request, session } = state
  return (
    <div className="wrap">
      <div className="card">
        <Brand phrase={state.phrase} />
        {!state.phrase && <PhraseSetup />}
        {request ? (
          <RequestScreen request={request} state={state} />
        ) : (
          <>
            {state.origin ? (
              <>
                <div className="status">
                  <span className="dot ok" />
                  {t('Connected to')} <span className="mono">{state.origin}</span>
                </div>
                <p className="dim">
                  {t('Waiting for requests from the dashboard. Nothing is signed without your approval on this page.')}
                </p>
              </>
            ) : (
              <div className="status">
                <span className="dot" />
                {t('Waiting for the dashboard…')}
              </div>
            )}
            <div className="status">
              <span className={'dot' + (session.unlocked ? ' ok' : '')} />
              {t('Wallet')}: {session.unlocked ? t('Unlocked') : t('Locked')}
              {session.address ? <span className="mono dim"> · {session.address.slice(0, 6)}…{session.address.slice(-4)}</span> : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const state = useSyncExternalStore(subscribe, getState)
  if (state.mode === 'standalone') return <Standalone phrase={state.phrase} />
  if (state.mode === 'iframe') return null // silent ops only; nothing to show
  return <Connected state={state} />
}
