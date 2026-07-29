# amparo vault

The open-source signing vault for [amparo](https://amparo.systems) — the small
web app served at **`vault.amparo.systems`** that holds everything able to
touch your money:

- your **account password** (typed only here, never on the dashboard),
- your **wallet key** (generated/imported, encrypted, and unlocked only here),
- **every signature** (each one decoded and approved by you, on this page).

The amparo dashboard is a separate, proprietary app on a different origin. It
can *ask* this vault for a signature over a message channel; the browser's
same-origin policy is what keeps your password and key out of its reach. The
full protocol and threat model are in [PROTOCOL.md](PROTOCOL.md).

For the reasoning behind the design — why a popup rather than an iframe, why the
approval screen decodes what it signs, and where the approach stops reaching —
see [Using the same-origin policy as a custody boundary](docs/same-origin-custody-boundary.md).

## Why a popup, not an embedded frame

An embedded frame has no URL bar, so a compromised dashboard could draw a
pixel-perfect fake of this vault. The vault therefore opens as a **popup with
a real address bar** for every password entry and every approval — check it
reads `vault.amparo.systems` before typing anything. A per-device
**security phrase** you pick on first use is shown on every real vault screen
as a second signal; a fake window can't know it.

## What the approval screen shows

The vault decodes each transaction and EIP-712 message into meaningful fields
— recipient, amount, asset, market, side — **from the exact payload it will
sign**, and signs precisely that. Anything it can't decode is shown verbatim
with a warning, and the raw payload is always one click away. It never renders
a description supplied by the dashboard.

## Verify it yourself

The deployed bundle is committed to this repo under [`dist/`](dist/), with a
hash manifest ([`dist/integrity.json`](dist/integrity.json)) and Subresource
Integrity attributes the browser enforces. Two checks, no cooperation from us
needed:

```bash
# 1. the committed bundle really compiles from this source (byte-for-byte)
nvm use && npm ci && npm run build
git diff --exit-code dist/

# 2. the live vault serves exactly that bundle — nothing injected
npm run verify-site https://vault.amparo.systems
```

`verify-site` compares every served file's SHA-256 against the manifest in
**your local checkout** — never one fetched from the live site.

Unit tests for the trust boundary (origin pairing, passkey RP scoping, payload
decoding): `npm test`.

## Honest limits

- **This is not "cryptographically verifiable" end-to-end.** The checks above
  prove the live site matches this source *when you run them*. Until a
  transparency log or a Code-Verify-style browser check exists, the claim is:
  auditable source + reproducible build + a spot-check you can run any time —
  and between checks, you trust us (and our host) to keep serving it.
- **The key is an extractable value in page memory while unlocked.** Ethereum's
  secp256k1 is not supported by WebCrypto, so non-extractable keys aren't
  available. The defenses are a strict CSP (`default-src 'none'` baked into
  the page, no third-party scripts, fonts, or analytics — ever), a minimal
  dependency surface, and the popup's short lifetime. This is not
  hardware-wallet-grade key protection and we don't claim it is.
- **A password-encrypted wallet is as strong as the password** (600k PBKDF2
  rounds slow guessing down; they don't fix a weak password). Passkey-protected
  wallets use the authenticator's PRF secret instead — nothing to guess — with
  a backup key you must keep.

## Development

```bash
npm ci
npm run dev        # http://localhost:5174 (dashboard dev server pairs from :5173)
npm test           # origin/rp-scoping/decoder unit suites
npm run build      # dist/ + SRI + integrity.json (commit dist/ with your change)
```

Origin pairing is derived at runtime from the page's own hostname
(`vault.<apex>` ⇄ `dashboard.<apex>`; localhost pairs with localhost), so the
committed production bundle runs unmodified in local development and tests.

## License

[MIT](LICENSE) — the verification story only works if anyone may clone,
rebuild, and inspect this code, so the vault is genuinely open source. (The
amparo dashboard and backend are separate, proprietary software; this license
covers the vault only.)
