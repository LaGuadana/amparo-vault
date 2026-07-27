// Unlock, offering every way in this wallet has (app/api/wallet.py
// wallet_protectors): a password, a PIN, a passkey per device. Whichever is
// most convenient here goes first — a passkey needs one tap, so it wins when
// the platform has one — and the rest sit behind "another way".
//
// The secret is used for exactly one decrypt and discarded. Locked-out
// passwordless users still get backup-key recovery.
import { useEffect, useMemo, useState } from 'react'
import * as session from './session.js'
import { refreshSession } from './store.js'
import { getWalletPasskeySecret } from './webauthn.js'
import { rejectCurrent } from './approve.js'
import { RecoverPanel } from './onboarding.jsx'
import { t } from './i18n.js'
import { Field, ErrText } from './ui.jsx'

export const KIND_NAME = { 0: 'Password', 1: 'PIN', 2: 'Face ID / Touch ID' }

export default function UnlockPanel({ onUnlocked }) {
  const [blob, setBlob] = useState(null)
  const [me, setMe] = useState(null)
  const [pickedId, setPickedId] = useState(null)
  const [secret, setSecret] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    let alive = true
    session.fetchBlob().then((b) => alive && setBlob(b)).catch((e) => alive && setErr(e.message))
    session.fetchMe().then((m) => alive && setMe(m)).catch(() => {})
    return () => { alive = false }
  }, [])

  const list = blob?.protectors || []
  // A passkey is one tap, so prefer it; otherwise first come, first offered.
  const picked = useMemo(
    () => list.find((p) => p.id === pickedId) || list.find((p) => p.kind === 2) || list[0] || null,
    [list, pickedId],
  )

  async function unlock(p, s) {
    setErr(null)
    setBusy(true)
    try {
      await session.unlockWithProtector(p, s)
      setSecret('')
      refreshSession()
      onUnlocked?.()
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

  if (!picked) {
    return (
      <>
        <h1>{t('Unlock your wallet')}</h1>
        {err ? <ErrText error={err} /> : <p className="dim">…</p>}
        {err && <div className="btnrow"><button className="ghost" onClick={rejectCurrent}>{t('Reject')}</button></div>}
      </>
    )
  }

  const others = list.filter((p) => p.id !== picked.id)
  const switcher = others.length > 0 && (
    choosing ? (
      <div className="ways">
        {others.map((p) => (
          <button key={p.id} className="ghost way" onClick={() => { setPickedId(p.id); setChoosing(false); setSecret(''); setErr(null) }}>
            {p.label || t(KIND_NAME[p.kind] || 'Password')}
          </button>
        ))}
      </div>
    ) : (
      <div className="btnrow center">
        <button className="ghost" onClick={() => setChoosing(true)}>{t('Unlock another way')}</button>
      </div>
    )
  )

  const recovery = me?.passwordless && (
    <div className="btnrow center">
      <button className="ghost" onClick={() => { setRecovering(true); setErr(null) }}>
        {picked.kind === 2
          ? t('Lost your device? Recover with your backup key')
          : t('Forgot your PIN? Recover with your backup key')}
      </button>
    </div>
  )

  if (picked.kind === 2) {
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
                const s = await getWalletPasskeySecret(picked.wrap_meta)
                await session.unlockWithProtector(picked, s)
                refreshSession()
                onUnlocked?.()
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
        {switcher}
        {recovery}
      </>
    )
  }

  const isPin = picked.kind === 1
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
        onKeyDown={(e) => e.key === 'Enter' && secret && unlock(picked, secret)}
      />
      <ErrText error={err} />
      <div className="btnrow">
        <button className="primary" disabled={busy || !secret} onClick={() => unlock(picked, secret)}>
          {busy ? t('Unlocking…') : t('Unlock')}
        </button>
        <button className="ghost" onClick={rejectCurrent}>{t('Reject')}</button>
      </div>
      {switcher}
      {recovery}
    </>
  )
}
