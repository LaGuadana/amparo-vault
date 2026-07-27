// Client-side key encryption: PBKDF2-SHA256 -> AES-256-GCM (WebCrypto).
// Byte-for-byte the scheme the dashboard has always used (web/src/lib/crypto.js)
// — the vault must decrypt blobs encrypted before it existed. The server only
// ever stores {ciphertext, iv, salt, kdf_iters}.
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(password, salt, iters) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

export async function encryptSecret(plaintext, password, iters = 600_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iters)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return { ciphertext: b64(ct), iv: b64(iv), salt: b64(salt), kdf_iters: iters }
}

export async function decryptSecret({ ciphertext, iv, salt, kdf_iters }, password) {
  const key = await deriveKey(password, unb64(salt), kdf_iters)
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext))
    return dec.decode(pt)
  } catch {
    throw new Error('wrong password (decryption failed)')
  }
}

// Auth verifier — the ONLY password-derived value that ever leaves the browser.
// One-way, deliberately slow, domain-separated from the wallet KDF by its salt.
// Same derivation as the dashboard's (see SECURITY.md §1); it moves here in
// full when login moves into the vault.
export async function deriveAuthVerifier(password, email, iters = 600_000) {
  const salt = enc.encode('amparo-auth-v1:' + String(email ?? '').trim().toLowerCase())
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, base, 256)
  return b64(bits)
}
