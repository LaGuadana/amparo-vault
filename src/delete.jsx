// Account-deletion confirmation, vault-side: the server demands the account
// password (by verifier) so a stolen dashboard session alone can't erase an
// account — and since the password may only ever be typed in the vault, the
// confirmation lives here. The dashboard sends the retyped email; the user
// supplies the password; the vault makes the call.
import { useEffect, useState } from 'react'
import { pwAuth } from './api.js'
import * as session from './session.js'
import { resolveCurrent, rejectCurrent } from './approve.js'
import { t } from './i18n.js'
import { Field, ErrText } from './ui.jsx'

export default function DeleteFlow({ payload }) {
  const [me, setMe] = useState(null)
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    session.fetchMe().then((m) => alive && setMe(m)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [])

  const confirmEmail = String(payload?.confirm_email || '')

  async function del() {
    setErr(null)
    setBusy(true)
    try {
      const res = await pwAuth('/api/auth/delete-account', {
        email: me?.email || confirmEmail,
        password,
        body: { confirm_email: confirmEmail },
      })
      session.setJwt(null) // account is gone; drop everything
      resolveCurrent(res)
    } catch (e) {
      setErr(e.detail || e.message)
    } finally {
      setBusy(false)
    }
  }

  if (me?.passwordless) {
    return (
      <>
        <h1>{t('Delete my account')}</h1>
        <p className="dim">
          {t('Google-account deletion isn’t self-service yet — contact support and we’ll erase it for you.')}
        </p>
        <div className="btnrow">
          <button className="ghost" onClick={rejectCurrent}>{t('Close')}</button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1>{t('Delete my account')}</h1>
      <p className="dim">
        {t('This permanently erases the account {email} and everything stored with it, including the encrypted copy of your wallet key. It cannot be undone.', { email: confirmEmail })}
      </p>
      <Field
        label={t('Your password')}
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <ErrText error={err} />
      <div className="btnrow">
        <button className="danger" disabled={busy || !password || !me} onClick={del}>
          {busy ? t('Deleting…') : t('Delete my account')}
        </button>
        <button className="ghost" disabled={busy} onClick={rejectCurrent}>{t('Cancel')}</button>
      </div>
    </>
  )
}
