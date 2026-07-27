// Vault-origin API client. Same backend as the dashboard, reached via the
// vault origin's own /api proxy (Caddy in prod, vite proxy in dev) — no CORS.
// The JWT lives here (module memory) once the dashboard shares it or the vault
// mints it at login.
import { deriveAuthVerifier } from './crypto.js'

let token = null
export const getApiToken = () => token
export const setApiToken = (t) => { token = t || null }

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(data?.detail || res.statusText), { detail: data?.detail, status: res.status })
  return data
}

// Password-verified endpoints, without the raw password on the wire — the
// vault sends the one-way verifier, exactly like the dashboard used to
// (web/src/lib/api.js pwAuth) before password entry moved here. Legacy
// accounts answer 409 once; the retry proves the raw password so the server
// can upgrade the stored credential to the verifier scheme.
export async function pwAuth(path, { email, password, body = {}, method = 'POST' } = {}) {
  const verifier = await deriveAuthVerifier(password, email)
  try {
    return await api(path, { method, body: { ...body, password: verifier } })
  } catch (e) {
    if (e.status === 409) {
      return await api(path, { method, body: { ...body, password: verifier, legacy_password: password } })
    }
    throw e
  }
}
