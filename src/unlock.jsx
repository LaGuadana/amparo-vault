// Protector-aware unlock, shown when a signature is requested while the vault
// is locked: password (protector 0), PIN (1), or device passkey (2). The
// secret is used for one decrypt and discarded. Locked-out passwordless users
// get the backup-key recovery path (onboarding.jsx RecoverPanel).
import { useEffect, useState } from 'react'
import * as session from './session.js'
import { refreshSession } from './store.js'
import { getWalletPasskeySecret } from './webauthn.js'
import { rejectCurrent } from './approve.js'
import { RecoverPanel } from './onboarding.jsx'
import { t } from './i18n.js'
import { Field, ErrText } from './ui.jsx'

export default function UnlockPanel() {
  const [blob, setBlob] = useState(null)
  const [me, setMe] = useState(null)
  const [secret, setSecret] = useState('') // password or PIN, per protector
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    let alive = true
    session.fetchBlob().then((b) => alive && setBlob(b)).catch((e) => alive && setErr(e.message))
    session.fetchMe().then((m) => alive && setMe(m)).catch(() => {})
    return () => { alive = false }
  }, [])

  async function unlockWith(s) {
    setErr(null)
    setBusy(true)
    try {
      await session.unlockWithSecret(s)
      refreshSession() // App re-renders into the approval screen
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  if (recovering) {
    return (
      <RecoverPanel
        blobAddress={blob?.address}
        onDone={() => { setRecovering(false); refreshSession() }}
        onCancel={() => setRecovering(false)}
      />
    )
  }

  if (!blob) {
    return (
      <>
        <h1>{t('Unlock your wallet')}</h1>
        {err ? <ErrText error={err} /> : <p className="dim">…</p>}
        {err && (
          <div className="btnrow">
            <button className="ghost" onClick={rejectCurrent}>{t('Reject')}</button>
          </div>
        )}
      </>
    )
  }

  const passwordless = !!me?.passwordless
  const recoveryLink = passwordless && (
    <div className="btnrow center">
      <button className="ghost" onClick={() => { setRecovering(true); setErr(null) }}>
        {blob.protector === 2
          ? t('Lost your device? Recover with your backup key')
          : t('Forgot your PIN? Recover with your backup key')}
      </button>
    </div>
  )

  if (blob.protector === 2) {
    return (
      <>
        <h1>{t('Unlock your wallet')}</h1>
        <p className="dim">
          {t('The dashboard requested a signature. Unlock with your device — Face ID, Touch ID or your fingerprint. Your key never leaves this page.')}
        </p>
        <ErrText error={err} />
        <div className="btnrow">
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setErr(null)
              setBusy(true)
              try {
                const s = await getWalletPasskeySecret(blob.wrap_meta)
                await session.unlockWithSecret(s)
                refreshSession()
              } catch (e) {
                setErr(e?.message || String(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? t('Unlocking…') : t('Unlock with Face ID / Touch ID')}
          </button>
          <button className="ghost" onClick={rejectCurrent}>{t('Reject')}</button>
        </div>
        {recoveryLink}
      </>
    )
  }

  const isPin = blob.protector === 1
  return (
    <>
      <h1>{t('Unlock your wallet')}</h1>
      <p className="dim">
        {isPin
          ? t('The dashboard requested a signature. Enter your wallet PIN to unlock — it never leaves this page.')
          : t('The dashboard requested a signature. Enter your password to unlock your wallet first — it never leaves this page.')}
      </p>
      <Field
        label={isPin ? t('Wallet PIN') : t('Password')}
        type="password"
        autoComplete={isPin ? 'off' : 'current-password'}
        autoFocus
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && secret && unlockWith(secret)}
      />
      <ErrText error={err} />
      <div className="btnrow">
        <button className="primary" disabled={busy || !secret} onClick={() => unlockWith(secret)}>
          {busy ? t('Unlocking…') : t('Unlock')}
        </button>
        <button className="ghost" onClick={rejectCurrent}>{t('Reject')}</button>
      </div>
      {recoveryLink}
    </>
  )
}
