// Small form primitives for the vault. Class-based styling only — the vault
// CSP (style-src 'self') forbids inline style attributes.
import { useId, useRef, useState } from 'react'
import { t } from './i18n.js'

export function Field({ label, hint, ...props }) {
  const id = useId()
  return (
    <div className="field">
      <label className="flabel" htmlFor={id}>{label}</label>
      <input id={id} {...props} />
      {hint ? <div className="fhint">{hint}</div> : null}
    </div>
  )
}

export function ErrText({ error }) {
  if (!error) return null
  return <div className="errtext">{String(error)}</div>
}

// Date of birth as three plain segments (day / month / year) instead of the
// browser's native date widget — typing beats a calendar for a birth date, it
// looks like the rest of the vault, and the order matches how our (mostly
// Spanish-speaking) users write dates. Emits "YYYY-MM-DD" (the API's format)
// once all three parts form a plausible date, '' otherwise.
export function DobField({ label, hint, onChange }) {
  const [d, setD] = useState('')
  const [m, setM] = useState('')
  const [y, setY] = useState('')
  const mRef = useRef(null)
  const yRef = useRef(null)
  const digits = (v, n) => v.replace(/\D/g, '').slice(0, n)
  const push = (dd, mm, yy) => {
    const D = Number(dd), M = Number(mm), Y = Number(yy)
    const ok = dd && mm && yy.length === 4 && D >= 1 && D <= 31 && M >= 1 && M <= 12 && Y >= 1900
    onChange(ok ? `${yy}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}` : '')
  }
  return (
    <div className="field">
      <label className="flabel">{label}</label>
      <div className="dobrow">
        <input className="dob-d" inputMode="numeric" autoComplete="bday-day" placeholder={t('DD')}
          aria-label={t('Day')} value={d}
          onChange={(e) => { const v = digits(e.target.value, 2); setD(v); push(v, m, y); if (v.length === 2) mRef.current?.focus() }} />
        <input className="dob-m" inputMode="numeric" autoComplete="bday-month" placeholder={t('MM')}
          aria-label={t('Month')} value={m} ref={mRef}
          onChange={(e) => { const v = digits(e.target.value, 2); setM(v); push(d, v, y); if (v.length === 2) yRef.current?.focus() }} />
        <input className="dob-y" inputMode="numeric" autoComplete="bday-year" placeholder={t('YYYY')}
          aria-label={t('Year')} value={y} ref={yRef}
          onChange={(e) => { const v = digits(e.target.value, 4); setY(v); push(d, m, v) }} />
      </div>
      {hint ? <div className="fhint">{hint}</div> : null}
    </div>
  )
}

export function Check({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '')
