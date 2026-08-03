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
import ProtectorsFlow from './protectors.jsx'
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

// One-time, non-blocking phrase setup. Collapsed to a single quiet line so it
// never sits between a first-time user and the actual step (register, code,
// wallet setup) — expanded, its input was FIRST in the tab order and stole
// focus/autofill from the primary form. Expands on demand; once a phrase is
// saved it lives in the brand line and this row disappears for good.
function PhraseSetup() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  if (!open) {
    return (
      <button type="button" className="phrasehint" onClick={() => setOpen(true)}>
        <span>{t('Set a security phrase so you can recognize the real vault')}</span>
        <span className="phrasehint-arrow" aria-hidden="true">›</span>
      </button>
    )
  }
  return (
    <div className="phrasebox">
      <div className="dim">
        {t('Pick a security phrase for this device. The real vault will always show it up here — a fake window can’t know it.')}
      </div>
      <div className="phraserow">
        <input
          value={value}
          maxLength={40}
          autoFocus
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

// Decode ONE signing item to {d, raw}. `d` is null for sign_message (the
// verbatim text is the meaning); `raw` is always the exact object to be signed.
function decodeItem(kind, payload) {
  if (kind === 'sign_tx') return { d: decodeTx(payload.tx, t), raw: payload.tx }
  if (kind === 'sign_typed') return { d: decodeTyped(payload.typed_data, t), raw: payload.typed_data }
  return { d: null, raw: payload.message }
}

// The decoded body of one item: the meaning up top, the warning, then the exact
// bytes one <details> away. Shared by the single and batch approval screens so a
// batched item is reviewed to the same depth as a lone one — nothing is signed
// blind whether it arrived alone or in a group.
function ItemBody({ kind, d, raw }) {
  return (
    <>
      <div className="payload">
        {d ? <Rows rows={d.rows} /> : <pre className="pjson">{String(raw)}</pre>}
      </div>
      {d?.warning && <div className="warnbox">{d.warning}</div>}
      <details className="rawbox">
        <summary>{t('Technical details & raw payload')}</summary>
        {d?.techRows ? <div className="payload"><Rows rows={d.techRows} /></div> : null}
        <pre className="pjson">{typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}</pre>
      </details>
    </>
  )
}

function ApprovalScreen({ request, origin }) {
  const [busy, setBusy] = useState(false)
  const { kind, payload } = request
  const isBatch = kind === 'sign_batch'

  // Decoded from the exact object(s) approveCurrent() will sign — same
  // references, no re-fetch, nothing dashboard-supplied besides the payload.
  const items = useMemo(() => {
    const list = isBatch ? payload.items : [{ kind, payload }]
    return list.map((it) => ({ kind: it.kind, ...decodeItem(it.kind, it.payload) }))
  }, [isBatch, kind, payload])

  async function approve() {
    setBusy(true)
    try { await approveCurrent() } finally { setBusy(false) }
  }

  const title = isBatch
    ? t('Approve {n} actions', { n: items.length })
    : (items[0].d ? items[0].d.title : t('Signature request'))

  return (
    <>
      <h1>{title}</h1>
      <div className="askedby">
        <span className="dim">{isBatch ? t('{n} signatures', { n: items.length }) : t(KIND_LABEL[kind] || kind)}</span>
        {origin ? <span className="mono dim"> · {origin}</span> : null}
      </div>
      <p className="dim">
        {isBatch
          ? t('These are all the signatures this one action needs. Review each — approving signs exactly what is shown here, in order, and nothing else.')
          : t('Review what will be signed. Approving signs exactly what is shown here — nothing else.')}
      </p>
      {isBatch ? (
        items.map((it, i) => (
          <div className="batchitem" key={i}>
            <div className="batchhead">
              <span className="batchnum">{i + 1}</span>
              <span>{it.d ? it.d.title : t(KIND_LABEL[it.kind] || it.kind)}</span>
            </div>
            <ItemBody kind={it.kind} d={it.d} raw={it.raw} />
          </div>
        ))
      ) : (
        <ItemBody kind={items[0].kind} d={items[0].d} raw={items[0].raw} />
      )}
      <div className="btnrow">
        <button className="primary" disabled={busy} onClick={approve}>
          {busy ? t('Signing…') : isBatch ? t('Approve & sign all') : t('Approve & sign')}
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
    return <OnboardingFlow knownPassword={null} onDone={(address) => resolveCurrent({ address })} />
  }
  if (kind === 'confirm_delete') {
    return <DeleteFlow payload={payload} />
  }
  // Adding a way in requires re-wrapping the key, so this screen — like
  // signing — waits behind the unlock panel.
  if (kind === 'manage_protectors') {
    return state.session.unlocked ? <ProtectorsFlow /> : <UnlockPanel />
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
