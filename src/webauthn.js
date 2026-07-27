// Passkey (WebAuthn PRF) wallet protection — port of the dashboard's
// web/src/lib/webauthn.js with ONE load-bearing change: passkeys created here
// pin `rp.id` to the registrable apex (amparo.systems), so the SAME passkey is
// assertable from any amparo subdomain if the vault origin ever moves.
//
// Migration caveat, stated honestly: passkeys created by the OLD in-dashboard
// flow were bound to the dashboard's full hostname (no rp.id was set), and
// WebAuthn will not assert them from the vault origin. Their wrap_meta has no
// rpId field; getWalletPasskeySecret then asserts with the vault's default RP
// and fails, and the unlock screen falls back to backup-key recovery, which
// re-protects with a fresh vault-scoped passkey. (The passkey feature shipped
// days before the vault split, so this affects at most a handful of wallets.)
//
// How it stays non-custodial: the PRF extension returns a stable 32-byte
// secret bound to (this passkey, this salt), released only after the platform
// verifies the user (biometric). That secret feeds the SAME PBKDF2->AES-GCM
// path as the PIN/password (crypto.js). No server-side WebAuthn ceremony —
// the server stores {credId, prfSalt, rpId} opaquely, never the secret.

const enc = new TextEncoder()
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))

function randomBytes(n) {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a
}

// The RP id new passkeys bind to. Pure function of the hostname (unit-tested
// in scripts/test-origins.mjs): vault.<apex> -> <apex>, so dashboard.<apex>
// could assert it too if ever needed; localhost -> undefined (WebAuthn default,
// i.e. localhost itself — apex-scoping doesn't exist there).
export function rpIdFor(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined
  if (hostname.startsWith('vault.') && hostname.length > 'vault.'.length) {
    return hostname.slice('vault.'.length)
  }
  return hostname
}

export async function platformAuthAvailable() {
  try {
    const P = window.PublicKeyCredential
    if (!P || !P.isUserVerifyingPlatformAuthenticatorAvailable) return false
    return await P.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// Enroll a new passkey and return the PRF secret plus the {credId, prfSalt,
// rpId} needed to re-derive it at unlock. Throws (caller falls back to a PIN)
// if the platform can't create a PRF-capable passkey.
export async function createWalletPasskey({ email, address }) {
  const prfSalt = randomBytes(32)
  const rpId = rpIdFor(window.location.hostname)
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'amparo', ...(rpId ? { id: rpId } : {}) },
      user: {
        id: enc.encode(address || email || 'amparo-user'),
        name: email || 'amparo',
        displayName: email || 'amparo wallet',
      },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      extensions: { prf: {} },
    },
  })
  if (!cred) throw new Error('Passkey setup was cancelled.')
  const wrapMeta = { credId: b64url(cred.rawId), prfSalt: b64(prfSalt), ...(rpId ? { rpId } : {}) }
  // Most platforms don't return the PRF result on create(); evaluate it via a
  // get() so the secret is obtained the same way it will be on unlock.
  const secret = await getWalletPasskeySecret(wrapMeta)
  return { secret, wrapMeta }
}

// Evaluate the PRF for an existing passkey (prompts Face ID / Touch ID) and
// return the base64 secret used as the wallet KDF input.
export async function getWalletPasskeySecret(wrapMeta) {
  if (!wrapMeta || !wrapMeta.credId || !wrapMeta.prfSalt) {
    throw new Error('This wallet has no passkey on file.')
  }
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: unb64url(wrapMeta.credId) }],
      ...(wrapMeta.rpId ? { rpId: wrapMeta.rpId } : {}),
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: unb64(wrapMeta.prfSalt) } } },
    },
  })
  const results = assertion?.getClientExtensionResults?.()
  const first = results?.prf?.results?.first
  if (!first) {
    throw new Error("Your device didn't return a passkey secret (Face ID / Touch ID unsupported here).")
  }
  return b64(first) // 32-byte high-entropy secret, base64
}
