// "Ways to unlock" — add or remove the methods that open this wallet.
//
// Why this screen exists: a platform passkey belongs to the device that made
// it, so someone who signed up on a laptop cannot use Face ID on their phone
// unless they can add a second way in from the phone. Each method is an
// independent wrapping of the same key (app/api/wallet.py wallet_protectors),
// so adding one requires an unlocked wallet — App gates this screen behind the
// unlock panel — and the last one can never be removed.
import { useEffect, useState } from 'react'
import * as session from './session.js'
import { platformAuthAvailable, createWalletPasskey } from './webauthn.js'
import { resolveCurrent } from './approve.js'
import { KIND_NAME } from './unlock.jsx'
import { t } from './i18n.js'
import { Field, ErrText } from './ui.jsx'

// Name a passkey after where it lives, so "remove" is an informed decision
// later. Best-effort: the platform string is all the browser will tell us.
function deviceLabel() {
  const p = navigator.userAgentData?.platform || navigator.platform || ''
  return p ? t('Face ID / Touch ID on {device}', { device: p }) : t('Face ID / Touch ID')
}

export default function ProtectorsFlow() {
  const [list, setList] = useState(session.protectors())
  const [me, setMe] = useState(null)
  const [pkAvail, setPkAvail] = useState(false)
  const [adding, setAdding] = useState(null) // null | 'password' | 'pin'
  const [secret, setSecret] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)

  useEffect(() => {
    let alive = true
    session.fetchMe().then((m) => alive && setMe(m)).catch(() => {})
    platformAuthAvailable().then((ok) => alive && setPkAvail(ok))
    session.fetchBlob(true).then((b) => alive && setList(b.protectors || [])).catch(() => {})
    return () => { alive = false }
  }, [])

  const has = (kind) => list.some((p) => p.kind === kind)

  async function run(fn, okNote) {
    setErr(null)
    setNote(null)
    setBusy(true)
    try {
      setList(await fn())
      setAdding(null)
      setSecret('')
      setConfirm('')
      setNote(okNote)
    } catch (e) {
      setErr(e.detail || e.message)
    } finally {
      setBusy(false)
    }
  }

  const addPasskey = () => run(async () => {
    const { secret: prf, wrapMeta } = await createWalletPasskey({
      email: me?.email, address: session.address(),
    })
    return session.addProtector({ kind: 2, secret: prf, wrapMeta, label: deviceLabel() })
  }, t('Face ID / Touch ID added on this device.'))

  const addPin = () => {
    if (secret.length < 6) return setErr(t('Choose a PIN of at least 6 characters.'))
    if (secret !== confirm) return setErr(t('The two PINs don’t match.'))
    return run(() => session.addProtector({ kind: 1, secret, label: t('PIN') }),
      t('PIN added.'))
  }

  const addPassword = () => run(
    () => session.addProtector({ kind: 0, secret, label: t('Account password') }),
    t('Your account password now unlocks this wallet.'),
  )

  return (
    <>
      <h1>{t('Ways to unlock')}</h1>
      <p className="dim">
        {t('Any of these opens your wallet on this device. Add one per device you use — a passkey only works on the device that created it.')}
      </p>

      <div className="ways">
        {list.map((p) => (
          <div className="wayrow" key={p.id}>
            <span>{p.label || t(KIND_NAME[p.kind] || 'Password')}</span>
            {list.length > 1 ? (
              <button
                className="ghost"
                disabled={busy}
                onClick={() => run(() => session.removeProtector(p.id), t('Removed.'))}
              >
                {t('Remove')}
              </button>
            ) : (
              <span className="dim">{t('only way in')}</span>
            )}
          </div>
        ))}
      </div>

      {adding === 'pin' ? (
        <>
          <Field
            label={t('Choose a wallet PIN')}
            hint={t('At least 6 characters. It never reaches the server and cannot be reset.')}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <Field label={t('Confirm PIN')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <ErrText error={err} />
          <div className="btnrow">
            <button className="primary" disabled={busy} onClick={addPin}>{busy ? t('Saving…') : t('Add PIN')}</button>
            <button className="ghost" onClick={() => { setAdding(null); setErr(null) }}>{t('Cancel')}</button>
          </div>
        </>
      ) : adding === 'password' ? (
        <>
          <Field
            label={t('Your account password')}
            hint={t('The password you log in with — it will unlock your wallet too.')}
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <ErrText error={err} />
          <div className="btnrow">
            <button className="primary" disabled={busy || !secret} onClick={addPassword}>
              {busy ? t('Saving…') : t('Add password')}
            </button>
            <button className="ghost" onClick={() => { setAdding(null); setErr(null) }}>{t('Cancel')}</button>
          </div>
        </>
      ) : (
        <>
          {note && <p className="okline">{note}</p>}
          <ErrText error={err} />
          <div className="addrow">
            {pkAvail && (
              <button className="ghost" disabled={busy} onClick={addPasskey}>
                {busy ? '…' : t('Add Face ID / Touch ID')}
              </button>
            )}
            {!has(1) && (
              <button className="ghost" disabled={busy} onClick={() => { setAdding('pin'); setErr(null) }}>
                {t('Add a PIN')}
              </button>
            )}
            {!has(0) && !me?.passwordless && (
              <button className="ghost" disabled={busy} onClick={() => { setAdding('password'); setErr(null) }}>
                {t('Add my password')}
              </button>
            )}
          </div>
          <div className="btnrow">
            <button className="primary" onClick={() => resolveCurrent({ ways: list.length })}>{t('Done')}</button>
          </div>
        </>
      )}
    </>
  )
}
