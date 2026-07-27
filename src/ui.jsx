// Small form primitives for the vault. Class-based styling only — the vault
// CSP (style-src 'self') forbids inline style attributes.
import { useId } from 'react'

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

export function Check({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '')
