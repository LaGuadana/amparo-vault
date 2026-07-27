// Wallet setup inside the vault — the port of the dashboard's Onboarding.jsx
// now that key generation/import happens only on this origin.
// - Password accounts: the blob is encrypted with the ACCOUNT password,
//   verified server-side (check-password, by verifier) BEFORE anything is
//   encrypted, so a typo can never lock funds behind an unknown password.
//   When setup runs right after an in-vault login, that password is already in
//   popup memory and isn't asked again.
// - Passwordless (Google) accounts: PIN or device passkey (PRF), exactly like
//   the dashboard flow this replaces; new passkeys are apex-scoped (webauthn.js).
// - Recovery (locked-out passwordless): paste the backup key, re-protect,
//   overwrite the stored blob.
import { useEffect, useState } from 'react'
import { api, pwAuth } from './api.js'
import { encryptSecret } from './crypto.js'
import { generateWallet, importWallet } from './signer.js'
import * as session from './session.js'
import { refreshSession } from './store.js'
import { platformAuthAvailable, createWalletPasskey } from './webauthn.js'
import { t } from './i18n.js'
import { Field, ErrText, Check, short } from './ui.jsx'

// Download the private key as a plain-text backup — for passwordless accounts
// the ONLY way back in after a lost device/PIN.
function downloadRecovery(privateKey, address) {
  const body =
    'amparo wallet recovery\n' +
    '=======================\n' +
    'address: ' + address + '\n' +
    'private key: ' + privateKey + '\n\n' +
    'Keep this secret and offline. Anyone with this key controls your funds.\n' +
    'amparo never sees your key and cannot recover it for you.\n'
  const blob = new Blob([body], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'amparo-wallet-' + address.slice(0, 10) + '.txt'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Encrypt + persist the wallet, then adopt the unlocked key into the vault
// session. Returns the address.
async function persistWallet({ wallet, privateKey, me, secretMode, password, pin }) {
  if (me.passwordless) {
    if (secretMode === 'passkey') {
      const { secret, wrapMeta } = await createWalletPasskey({ email: me.email, address: wallet.address })
      const blob = await encryptSecret(privateKey, secret)
      await api('/api/wallet', { method: 'POST', body: { address: wallet.address, ...blob, protector: 2, wrap_meta: wrapMeta } })
      session.setBlobCache({ address: wallet.address, ...blob, protector: 2, wrap_meta: wrapMeta })
    } else {
      if (pin.length < 6) throw new Error(t('Choose a PIN of at least 6 characters.'))
      const blob = await encryptSecret(privateKey, pin)
      await api('/api/wallet', { method: 'POST', body: { address: wallet.address, ...blob, protector: 1 } })
      session.setBlobCache({ address: wallet.address, ...blob, protector: 1 })
    }
  } else {
    const chk = await pwAuth('/api/auth/check-password', { email: me.email, password })
    if (!chk.ok) {
      throw new Error(t("That's not your account password. Use the exact password you log in with — one password unlocks both your account and your wallet."))
    }
    const blob = await encryptSecret(privateKey, password)
    await pwAuth('/api/wallet', { email: me.email, password, body: { address: wallet.address, ...blob } })
    session.setBlobCache({ address: wallet.address, ...blob, protector: 0 })
  }
  session.adoptKey(privateKey, wallet.address)
  refreshSession()
  return wallet.address
}

// Which secret will protect the wallet. `askPassword` is false when the
// account password is already in popup memory (login -> setup continuation).
function SecretChooser({ me, askPassword, password, setPassword, pin, setPin, pinConfirm, setPinConfirm, pkAvail, secretMode, setSecretMode }) {
  if (!me.passwordless) {
    if (!askPassword) return null
    return (
      <Field
        label={t('Account password (encrypts your wallet)')}
        hint={t('The same password you log in with — one password unlocks everything.')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    )
  }
  return (
    <>
      {pkAvail && (
        <div className="toggle-row">
          <button type="button" className={secretMode === 'passkey' ? 'on' : ''}
                  onClick={() => setSecretMode('passkey')}>{t('Face ID / Touch ID')}</button>
          <button type="button" className={secretMode === 'pin' ? 'on' : ''}
                  onClick={() => setSecretMode('pin')}>{t('Use a PIN')}</button>
        </div>
      )}
      {secretMode === 'passkey' && pkAvail ? (
        <p className="dim">
          {t('You’ll confirm with Face ID / Touch ID when you continue. Your device protects the wallet — nothing to remember, and the server never sees it. Keep your backup in case you lose the device.')}
        </p>
      ) : (
        <>
          <Field
            label={t('Choose a wallet PIN')}
            hint={t('At least 6 characters. It encrypts your wallet on this device, never reaches the server, and cannot be reset — so keep your backup.')}
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <Field label={t('Confirm PIN')} type="password" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} />
        </>
      )}
    </>
  )
}

function useSecretState(knownPassword) {
  const [password, setPassword] = useState(knownPassword || '')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pkAvail, setPkAvail] = useState(false)
  const [secretMode, setSecretMode] = useState('pin')
  useEffect(() => {
    let alive = true
    platformAuthAvailable().then((ok) => {
      if (!alive) return
      setPkAvail(ok)
      if (ok) setSecretMode('passkey')
    })
    return () => { alive = false }
  }, [])
  return { password, setPassword, pin, setPin, pinConfirm, setPinConfirm, pkAvail, secretMode, setSecretMode }
}

const secretReady = (me, s, askPassword) => (me.passwordless
  ? (s.secretMode === 'passkey' && s.pkAvail ? true : s.pin.length >= 6 && s.pin === s.pinConfirm)
  : (askPassword ? !!s.password : true))

// The full setup flow: choose -> generate (key shown once + backup) | import.
export function OnboardingFlow({ knownPassword, onDone }) {
  const [me, setMe] = useState(null)
  const [mode, setMode] = useState('choose')
  const [gen, setGen] = useState(null)
  const [saved, setSaved] = useState(false)
  const [importKey, setImportKey] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const s = useSecretState(knownPassword)
  const askPassword = !knownPassword

  useEffect(() => {
    let alive = true
    session.fetchMe().then((m) => alive && setMe(m)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [])

  if (!me) return <ErrText error={err} />

  async function submit(wallet, privateKey) {
    setErr(null)
    setBusy(true)
    try {
      const address = await persistWallet({ wallet, privateKey, me, secretMode: s.pkAvail ? s.secretMode : 'pin', password: s.password, pin: s.pin })
      onDone(address)
    } catch (e) {
      setErr(e.detail || e.message)
    } finally {
      setBusy(false)
    }
  }

  const chooser = <SecretChooser me={me} askPassword={askPassword} {...s} />

  if (mode === 'choose') {
    return (
      <>
        <h1>{t('Set up your wallet')}</h1>
        <p className="dim">
          {me.passwordless
            ? t('Your private key is created or imported here in the vault, encrypted with a PIN or passkey you choose, and only the ciphertext is stored. Neither amparo nor the dashboard ever sees your key.')
            : t('Your private key is created or imported here in the vault, encrypted with your account password, and only the ciphertext is stored. Neither amparo nor the dashboard ever sees your key.')}
        </p>
        {/* No "not now": a wallet is what the product runs on, and skipping
            only returned the user to this same screen. Closing the window is
            the escape, and the dashboard reopens setup when they're ready. */}
        <div className="btnrow">
          <button className="primary" onClick={() => { setErr(null); setGen(generateWallet()); setSaved(false); setMode('generate') }}>
            {t('Generate new wallet')}
          </button>
          <button className="ghost" onClick={() => { setErr(null); setMode('import') }}>{t('Import existing key')}</button>
        </div>
      </>
    )
  }

  if (mode === 'generate' && gen) {
    return (
      <>
        <h1>{t('Your new wallet')}</h1>
        <div className="flabel">{t('Address')}</div>
        <div className="mono">{gen.wallet.address}</div>
        <div className="flabel">{t('Private key — shown once')}</div>
        <div className="keybox mono">{gen.privateKey}</div>
        <p className="errtext">
          {t('Store this now. It is shown ONCE and cannot be recovered. Anyone with this key controls your funds.')}
        </p>
        <div className="btnrow">
          <button className="ghost" type="button" onClick={() => downloadRecovery(gen.privateKey, gen.wallet.address)}>
            {t('Download backup')}
          </button>
        </div>
        <Check checked={saved} onChange={setSaved}>{t('I have saved my private key somewhere safe')}</Check>
        {chooser}
        <ErrText error={err} />
        <div className="btnrow">
          <button className="primary" disabled={busy || !saved || !secretReady(me, s, askPassword)} onClick={() => submit(gen.wallet, gen.privateKey)}>
            {busy ? t('Saving…') : t('Continue')}
          </button>
          <button className="ghost" onClick={() => setMode('choose')}>{t('Back')}</button>
        </div>
      </>
    )
  }

  // import
  let importAddr = null
  try { importAddr = importKey ? importWallet(importKey.trim()).address : null } catch { importAddr = null }
  return (
    <>
      <h1>{t('Import wallet')}</h1>
      <Field label={t('Private key')} placeholder="0x…" value={importKey} onChange={(e) => setImportKey(e.target.value)} />
      {importKey && (
        importAddr
          ? <div className="dim">{t('Address:')} {short(importAddr)}</div>
          : <div className="errtext">{t('Invalid private key')}</div>
      )}
      {chooser}
      <ErrText error={err} />
      <div className="btnrow">
        <button className="primary" disabled={busy || !importAddr || !secretReady(me, s, askPassword)}
                onClick={() => { try { const w = importWallet(importKey.trim()); submit(w, w.privateKey) } catch { setErr(t('Invalid private key')) } }}>
          {busy ? t('Saving…') : t('Import')}
        </button>
        <button className="ghost" onClick={() => setMode('choose')}>{t('Back')}</button>
      </div>
    </>
  )
}

// Locked-out recovery: the backup key must match the wallet on file, then it's
// re-protected with a fresh secret and overwrites the stored blob.
export function RecoverPanel({ blobAddress, onDone, onCancel }) {
  const [me, setMe] = useState(null)
  const [recoverKey, setRecoverKey] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const s = useSecretState(null)

  useEffect(() => {
    let alive = true
    session.fetchMe().then((m) => alive && setMe(m)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [])

  if (!me) return <ErrText error={err} />

  let addr = null
  try { addr = recoverKey ? importWallet(recoverKey.trim()).address : null } catch { addr = null }
  const match = addr && blobAddress && addr.toLowerCase() === blobAddress.toLowerCase()

  async function restore() {
    setErr(null)
    setBusy(true)
    try {
      const w = importWallet(recoverKey.trim())
      if (blobAddress && w.address.toLowerCase() !== blobAddress.toLowerCase()) {
        throw new Error(t('This key doesn’t match your wallet on file.'))
      }
      const address = await persistWallet({ wallet: w, privateKey: w.privateKey, me, secretMode: s.pkAvail ? s.secretMode : 'pin', password: s.password, pin: s.pin })
      onDone(address)
    } catch (e) {
      setErr(e.detail || e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t('Recover your wallet')}</h1>
      <p className="dim">
        {t('Paste the private key from your backup file to restore this wallet, then set a new way to unlock it.')}
      </p>
      <Field label={t('Backup private key')} placeholder="0x…" value={recoverKey} onChange={(e) => setRecoverKey(e.target.value)} />
      {recoverKey && (
        addr
          ? <div className={match ? 'dim' : 'errtext'}>{match ? `${t('Address:')} ${short(addr)}` : t('This key doesn’t match your wallet on file.')}</div>
          : <div className="errtext">{t('Invalid private key')}</div>
      )}
      <SecretChooser me={me} askPassword {...s} />
      <ErrText error={err} />
      <div className="btnrow">
        <button className="primary" disabled={busy || !match || !secretReady(me, s, true)} onClick={restore}>
          {busy ? t('Restoring…') : t('Restore wallet')}
        </button>
        <button className="ghost" onClick={onCancel}>{t('Back')}</button>
      </div>
    </>
  )
}
