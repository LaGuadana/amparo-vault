// Anti-phishing phrase: a word or two the user picks the first time they use
// the vault on a device, stored in the VAULT origin's localStorage (first-
// party in the popup — that's one reason the design is popup-first). The real
// vault shows it on every screen; a fake vault drawn by a compromised
// dashboard can't know it. It's a heuristic layer UNDER the primary defense
// (the popup's real URL bar) — cheap, and users habituate to seeing it.
//
// Deliberately not synced anywhere: it never leaves this origin's storage,
// and clearing site data just means picking a new one.
const KEY = 'amparo_vault_phrase'

export function getPhrase() {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}

export function setPhrase(p) {
  const v = String(p || '').trim().slice(0, 40)
  if (!v) return ''
  try { localStorage.setItem(KEY, v) } catch { /* private mode — session-only loss */ }
  return v
}
