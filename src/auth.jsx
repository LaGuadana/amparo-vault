// Email + password login/register INSIDE the vault popup — the port of the
// dashboard Login.jsx credential flow. The password is typed here, on the
// open-source origin with a real URL bar, and never leaves: the server gets a
// one-way verifier (api.js pwAuth), the wallet blob is decrypted here, and the
// dashboard receives only the JWT when the flow resolves.
//
// Google sign-in deliberately does NOT move here: it is identity-only (no
// password, no key material), and its script is third-party — the vault loads
// no third-party code, period. Passwordless accounts meet the vault at wallet
// setup/unlock instead.
//
// After OTP verification this flow keeps going so the user never re-types
// anything: password accounts unlock the wallet with the password already in
// popup memory; accounts with no wallet yet continue straight into setup.
import { useEffect, useState } from 'react'
import { api, pwAuth } from './api.js'
import * as session from './session.js'
import { refreshSession } from './store.js'
import { OnboardingFlow } from './onboarding.jsx'
import { t, getLang } from './i18n.js'
import { Field, ErrText, Check } from './ui.jsx'

function TermsModal({ title, text, onAgree, onClose }) {
  return (
    <div className="overlay">
      <div className="card overlay-card">
        <h1>{title}</h1>
        <div className="legal">
          {String(text || '').split('\n\n').map((block, i) => {
            const b = block.trim()
            if (b.startsWith('## ')) return <h3 key={i}>{b.slice(3)}</h3>
            if (b.startsWith('# ')) return <h2 key={i}>{b.slice(2)}</h2>
            if (b.split('\n').every((l) => l.trim().startsWith('- '))) {
              return <ul key={i}>{b.split('\n').map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}</ul>
            }
            return <p key={i}>{b}</p>
          })}
        </div>
        <div className="btnrow">
          {onAgree && <button className="primary" onClick={onAgree}>{t('I agree')}</button>}
          <button className="ghost" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  )
}

// payload: {mode: 'login'|'register', invite_code?} from the dashboard —
// presentation hints only; every decision that matters is re-checked here or
// on the server.
export default function AuthFlow({ payload, onDone, onCancel }) {
  const [mode, setMode] = useState(payload?.mode === 'register' ? 'register' : 'login')
  const [step, setStep] = useState('credentials') // 'credentials' | 'otp' | 'setup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [inviteCode, setInviteCode] = useState(payload?.invite_code || '')
  const [agreed, setAgreed] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [legal, setLegal] = useState(null) // {title, text, agree}
  const [verified, setVerified] = useState(null) // /auth/verify response, kept for the setup step

  // The vault double-checks geo itself (the server enforces regardless): where
  // registration is closed, don't render a Register tab that can only fail.
  const [geo, setGeo] = useState(null)
  const closed = geo?.registration_open === false
  useEffect(() => {
    let alive = true
    api('/api/geo/public')
      .then((g) => alive && setGeo(g))
      .catch(() => alive && setGeo({ registration_open: true }))
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (closed && mode === 'register') setMode('login')
  }, [closed, mode])

  async function openLegal(e, kind) {
    e.preventDefault()
    try {
      const doc = await api(`/api/legal/${kind}`)
      setLegal({
        title: kind === 'terms' ? t('Terms of Service') : t('Privacy Policy'),
        text: doc.text,
        agree: kind === 'terms',
      })
    } catch (er) {
      setErr(er.detail || er.message)
    }
  }

  async function submitCredentials(e) {
    e.preventDefault()
    setErr(null)
    setNote(null)
    setBusy(true)
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const extra = mode === 'register'
        ? { email, accepted_terms: agreed, date_of_birth: dob, invite_code: inviteCode.trim(), lang: getLang() }
        : { email, lang: getLang() }
      await pwAuth(path, { email, password, body: extra })
      setStep('otp')
      setNote(t('We sent a 6-digit code to {email}.', { email }))
    } catch (er) {
      setErr(er.detail || er.message)
    } finally {
      setBusy(false)
    }
  }

  // Resolve the login request toward the dashboard. Only the JWT and public
  // account facts cross the channel — never the password.
  function finish(res, address) {
    onDone({
      token: res.token,
      has_wallet: !!address || !!res.has_wallet,
      has_kraken: !!res.has_kraken,
      has_coinbase: !!res.has_coinbase,
      passwordless: !!res.passwordless,
      address: address ?? null,
    })
  }

  async function submitCode(e) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const res = await api('/api/auth/verify', { method: 'POST', body: { email, code: code.trim() } })
      session.setJwt(res.token)
      refreshSession()
      if (!res.has_wallet) {
        // Keep going into wallet setup — the password is already here, so the
        // user types nothing twice. Aborting still logs them in (dashboard
        // shows its set-up-later screen).
        setVerified(res)
        setStep('setup')
        return
      }
      // Unlock now with the password just used to log in (password accounts).
      let address = null
      try {
        const blob = await session.fetchBlob()
        if (!blob.protector) {
          const r = await session.unlockWithSecret(password)
          address = r.address
        }
      } catch { /* stays locked; unlock-on-demand will ask */ }
      refreshSession()
      finish(res, address)
    } catch (er) {
      setErr(er.detail || er.message)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setErr(null)
    setNote(null)
    try {
      await api('/api/auth/resend', { method: 'POST', body: { email, lang: getLang() } })
      setNote(t('New code sent to {email}.', { email }))
    } catch (er) {
      setErr(er.detail || er.message)
    }
  }

  if (step === 'setup' && verified) {
    return (
      <OnboardingFlow knownPassword={password || null} onDone={(address) => finish(verified, address)} />
    )
  }

  if (step === 'otp') {
    return (
      <>
        <h1>{t('Enter your code')}</h1>
        {note && <p className="dim">{note}</p>}
        <form onSubmit={submitCode}>
          <Field
            label={t('6-digit code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />
          <ErrText error={err} />
          <div className="btnrow">
            <button type="submit" className="primary" disabled={busy || code.length < 6}>
              {busy ? t('Verifying…') : t('Verify & continue')}
            </button>
          </div>
        </form>
        <div className="btnrow spread">
          <button className="ghost" onClick={() => { setStep('credentials'); setErr(null); setCode('') }}>← {t('Back')}</button>
          <button className="ghost" onClick={resend}>{t('Resend code')}</button>
        </div>
      </>
    )
  }

  return (
    <>
      {closed ? (
        <h1>{t('Log in')}</h1>
      ) : (
        <div className="toggle-row">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr(null) }}>{t('Log in')}</button>
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setErr(null) }}>{t('Register')}</button>
        </div>
      )}
      <p className="dim">
        {t('You are in amparo’s open-source vault — the only place your password is ever typed. Check the address bar before continuing.')}
      </p>
      <form onSubmit={submitCredentials}>
        <Field label={t('Email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field
          label={t('Password')}
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === 'register' && (
          <Field
            label={t('Date of birth')}
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            hint={t('amparo is for adults only — you must be 18 or older.')}
            required
          />
        )}
        {mode === 'register' && (
          <Field
            label={t('Referral code (optional)')}
            autoCapitalize="characters"
            placeholder="AMP-XXXXXX"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
        )}
        {mode === 'register' && (
          <Check checked={agreed} onChange={setAgreed}>
            {t('I have read and agree to the')}{' '}
            <a href="#terms" onClick={(e) => openLegal(e, 'terms')}>{t('Terms of Service')}</a>
            {' '}{t('and')}{' '}
            <a href="#privacy" onClick={(e) => openLegal(e, 'privacy')}>{t('Privacy Policy')}</a>
            {' '}{t('— the service is provided as-is, without warranty.')}
          </Check>
        )}
        <ErrText error={err} />
        <div className="btnrow">
          <button type="submit" className="primary" disabled={busy || !email || !password || (mode === 'register' && (!agreed || !dob))}>
            {busy ? '…' : mode === 'login' ? t('Log in') : t('Create account')}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>{t('Cancel')}</button>
        </div>
      </form>
      {legal && (
        <TermsModal
          title={legal.title}
          text={legal.text}
          onAgree={legal.agree ? () => { setAgreed(true); setLegal(null) } : null}
          onClose={() => setLegal(null)}
        />
      )}
    </>
  )
}
