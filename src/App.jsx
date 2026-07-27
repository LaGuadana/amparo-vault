// Vault UI shell: standalone explainer, connection status, and the screens
// each request kind walks through — login/register (auth.jsx), wallet setup
// (onboarding.jsx), protector-aware unlock (unlock.jsx), account deletion
// (delete.jsx), and the signature approval below. Everything rendered in the
// approval views comes from the payload that will be signed, nothing else
// (see approve.js).
//
// NOTE: no inline style={} anywhere in the vault — the CSP is style-src 'self',
// which forbids style attributes. Classes only.
import { useState, useSyncExternalStore } from 'react'
import { subscribe, getState } from './store.js'
import { approveCurrent, rejectCurrent, resolveCurrent } from './approve.js'
import AuthFlow from './auth.jsx'
import { OnboardingFlow } from './onboarding.jsx'
import UnlockPanel from './unlock.jsx'
import DeleteFlow from './delete.jsx'
import { t } from './i18n.js'

function Brand() {
  return (
    <div className="brandline">
      <span className="brand">amparo</span>
      <span className="tag">vault</span>
    </div>
  )
}

function Standalone() {
  return (
    <div className="wrap">
      <div className="card">
        <Brand />
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

// ---- payload summaries -------------------------------------------------------
// Step-2 baseline: show the actual fields of what will be signed, verbatim.
// Step 4 turns these into meaningful decodes (asset, market, recipient).

const CHAIN_NAME = { 1: 'Ethereum', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum' }
const CHAIN_SYMBOL = { 1: 'ETH', 137: 'POL', 8453: 'ETH', 42161: 'ETH' }

function chainLabel(chainId) {
  const id = Number(chainId)
  return CHAIN_NAME[id] ? `${CHAIN_NAME[id]} (${id})` : `chain ${id}`
}

function fmtNative(value, chainId) {
  const wei = BigInt(value ?? 0)
  const sym = CHAIN_SYMBOL[Number(chainId)] || ''
  const whole = wei / 10n ** 18n
  const frac = ((wei % 10n ** 18n) + 10n ** 18n).toString().slice(1).replace(/0+$/, '')
  return `${whole}${frac ? '.' + frac : ''} ${sym}`.trim()
}

function Row({ label, children }) {
  return (
    <div className="prow">
      <div className="plabel">{label}</div>
      <div className="pvalue mono">{children}</div>
    </div>
  )
}

function TxSummary({ tx }) {
  const data = typeof tx.data === 'string' && tx.data.length > 2 ? tx.data : null
  return (
    <div className="payload">
      <Row label={t('To')}>{tx.to}</Row>
      <Row label={t('Value')}>{fmtNative(tx.value, tx.chainId)}</Row>
      <Row label={t('Chain')}>{chainLabel(tx.chainId)}</Row>
      <Row label={t('Nonce')}>{String(tx.nonce)}</Row>
      <Row label={t('Gas limit')}>{String(tx.gas)}</Row>
      <Row label={t('Data')}>
        {data ? `${data.slice(0, 10)}… (${t('{n} bytes', { n: (data.length - 2) / 2 })})` : t('no data')}
      </Row>
    </div>
  )
}

function TypedSummary({ td }) {
  const d = td.domain || {}
  return (
    <div className="payload">
      <Row label={t('Domain')}>{[d.name, d.version].filter(Boolean).join(' v') || '—'}</Row>
      {d.chainId != null && <Row label={t('Chain')}>{chainLabel(d.chainId)}</Row>}
      <Row label={t('Type')}>{td.primaryType || Object.keys(td.types || {}).filter((k) => k !== 'EIP712Domain')[0] || '—'}</Row>
      <div className="plabel">{t('Contents')}</div>
      <pre className="pjson">{JSON.stringify(td.message, null, 2)}</pre>
    </div>
  )
}

function MessageSummary({ message }) {
  return (
    <div className="payload">
      <pre className="pjson">{message}</pre>
    </div>
  )
}

const KIND_LABEL = {
  sign_tx: 'Transaction',
  sign_typed: 'Typed message',
  sign_message: 'Message',
}

// ---- request flow -------------------------------------------------------------

function ApprovalScreen({ request, origin }) {
  const [busy, setBusy] = useState(false)
  const { kind, payload } = request

  async function approve() {
    setBusy(true)
    try { await approveCurrent() } finally { setBusy(false) }
  }

  return (
    <>
      <h1>{t('Signature request')}</h1>
      <div className="askedby">
        <span className="dim">{t(KIND_LABEL[kind] || kind)}</span>
        {origin ? <span className="mono dim"> · {origin}</span> : null}
      </div>
      <p className="dim">{t('Review what will be signed. Approving signs exactly what is shown here — nothing else.')}</p>
      {kind === 'sign_tx' && <TxSummary tx={payload.tx} />}
      {kind === 'sign_typed' && <TypedSummary td={payload.typed_data} />}
      {kind === 'sign_message' && <MessageSummary message={payload.message} />}
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
        <Brand />
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
  if (state.mode === 'standalone') return <Standalone />
  if (state.mode === 'iframe') return null // silent ops only; nothing to show
  return <Connected state={state} />
}
