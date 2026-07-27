# amparo vault — dashboard ⇄ vault protocol (v1)

The vault is a small, open-source web app on its own origin
(`vault.amparo.systems`). It owns the account password, the decrypted wallet
key, and every signature. The proprietary dashboard
(`dashboard.amparo.systems`) can only **ask** it for things over the protocol
below; the browser's same-origin policy is what keeps the key and password out
of the dashboard's reach.

Implementations: vault side `src/rpc.js` + `src/origins.js` (this repo/dir);
dashboard side `web/src/lib/vault.js`.

## Delivery: popup-first

- **Popup** (`window.open` to the vault origin) for password entry and every
  transaction approval. A popup has a real URL bar, so a compromised dashboard
  cannot draw a convincing fake of the vault's UI — the user can always check
  the address. (Same reasoning as Coinbase's `keys.coinbase.com`.) A top-level
  popup also gets first-party storage — no third-party partitioning.
- **Hidden iframe** only for silent, non-trust operations (liveness/status).
  The vault refuses signing kinds from an iframe (`popup_required`).

## Origin rules

Both sides derive their counterparty **at runtime from their own hostname**,
never from message content, query params, or referrers:

| This page runs on            | It will only pair with            |
| ---------------------------- | --------------------------------- |
| `vault.<apex>`               | `https://dashboard.<apex>`        |
| `dashboard.<apex>`           | `https://vault.<apex>`            |
| `localhost` / `127.0.0.1`    | localhost origins (dev/tests only)|
| anything else                | nothing                           |

- Receive: exact-match `event.origin` **and** `event.source` must be the
  window that opened/embeds the vault (`window.opener` / `window.parent`).
- Send: explicit `targetOrigin`, never `"*"`.
- The vault **pins** the dashboard origin on the first valid hello; messages
  from any other origin are ignored for the lifetime of the document.

## Handshake

1. The dashboard opens the vault (popup or iframe) and posts, every 150 ms
   until answered:

   ```json
   { "amparoVault": 1, "type": "hello", "nonce": "<random per attempt>" }
   ```

2. The vault validates origin + source, pins the origin, and answers **once
   per nonce** (a `MessagePort` can only be transferred once, so replays must
   not mint extra channels):

   ```json
   { "amparoVault": 1, "type": "hello-ack", "nonce": "<echoed>",
     "vault": { "version": 1, "mode": "popup" } }
   ```

   with a fresh `MessageChannel` port transferred alongside.

3. All further traffic flows over that dedicated port. The vault never acts on
   window-level messages other than `hello`; ports are pair-connected, so no
   third window can inject into the channel.

## Requests

```json
{ "id": 7, "kind": "ping", "payload": {} }
```

```json
{ "id": 7, "ok": true,  "result": { "pong": true } }
{ "id": 7, "ok": false, "error": { "code": "rate_limited", "message": "…" } }
```

### Kinds

| kind             | mode       | result                                                            |
| ---------------- | ---------- | ----------------------------------------------------------------- |
| `ping`           | any        | `{pong: true}`                                                    |
| `status`         | any        | `{version, mode, unlocked, address}`                              |
| `session`        | any        | dashboard shares `{jwt, lang}`; a changed JWT relocks the vault   |
| `sign_typed`     | popup only | `{r, s, v, flat}` after approval in the vault                     |
| `sign_tx`        | popup only | raw signed tx hex after approval                                  |
| `sign_message`   | popup only | `{flat}` (EIP-191) after approval                                 |
| `login`          | popup only | email+password+OTP (+ first wallet setup) typed IN the vault; resolves `{token, has_wallet, has_kraken, has_coinbase, passwordless, address}` |
| `setup_wallet`   | popup only | generate/import + protector choice in the vault; resolves `{address}` |
| `confirm_delete` | popup only | password-confirmed account erasure, performed by the vault        |

Signing kinds return **only the signature** — never key material. Payloads
never carry secrets in either direction: passwords, PINs, backup keys, and
passkey prompts happen *inside the vault popup*, not over the channel. The
JWT in `session` is the API bearer token the dashboard legitimately holds —
identity, not key material. Google sign-in stays on the dashboard for the
same reason (identity only), and because its script is third-party code the
vault refuses to load.

## Guards on signing (in force since v1, before any signing exists)

1. **Popup only** — `popup_required` from an iframe.
2. **User gesture** — every signature requires a click on the approval screen
   *inside the vault popup*. The dashboard cannot fabricate that click; its own
   `userActivation` check is defense-in-depth only.
3. **Single-flight** — one pending approval at a time (`busy`).
4. **Rate limit** — 30 signing requests per rolling 5 minutes (enough for
   legitimate multi-step flows, far below silent-drain cadence); other kinds
   120 per minute (`rate_limited`).

## The approval screen decodes what it signs (`src/decode.js`)

The linchpin control: the vault renders MEANING — recipient, amount, asset,
market, side — from the exact object it will sign, and from nothing else. No
dashboard-supplied labels or descriptions are ever displayed (a lying
"description" field is the oldest wallet-phishing trick there is), and the
raw payload is always one `<details>` away.

Decoded natively: ERC-20 transfers/approvals (with a token registry copied
from this repo's backend services — unknown tokens degrade to raw units +
address, never a guess), native sends, wrap/unwrap, Polymarket & Limitless
CLOB orders (side/shares/limit price/total, including Solady `TypedDataSign`
deposit-wallet wraps), CoW swaps, EIP-2612 permits, Azuro bets/cash-outs,
Polymarket `ClobAuth`, and Hyperliquid typed transactions. Hyperliquid L1
actions are hashed before signing by design — the vault says so honestly
instead of pretending to decode them. Anything unrecognized is shown verbatim
with a warning, so nothing is ever signed blind.

## Anti-phishing phrase (`src/phrase.js`)

At first use on a device the vault asks the user to pick a short phrase,
stored in the VAULT origin's localStorage (first-party in the popup — one
more reason for popup-first). Every real vault screen shows it in the header;
a fake vault drawn by a compromised dashboard can't know it. It layers UNDER
the primary defense (the popup's real URL bar) and never leaves the origin.

## Passkeys / WebAuthn — evaluation outcome

Adopted, as a wallet **protector** (how the key blob is encrypted), not as a
server login: the passkey's PRF output is the KDF input for the same
PBKDF2→AES-GCM scheme as the password/PIN paths, released only after the
platform verifies the user (Face ID / Touch ID). Because WebAuthn credentials
are origin-bound by the authenticator, a fake vault window harvests nothing
reusable — exactly the property the plan wanted. New passkeys pin
`rp.id = <apex>` so any amparo subdomain can assert them; legacy
dashboard-bound passkeys fall back to backup-key recovery (see webauthn.js).

## Error codes

`popup_required` · `busy` · `rate_limited` · `not_implemented` · `failed`
(vault side); `popup_blocked` · `gesture_required` · `vault_closed` ·
`vault_unreachable` · `timeout` · `no_vault` (dashboard side).

## Page hygiene (the other half of the trust story)

- CSP `default-src 'none'; script-src 'self'; …` baked into the built
  `index.html` (meta) and repeated as an HTTP header by the server, which adds
  `frame-ancestors https://dashboard.amparo.systems` (header-only directive) so
  no other site can embed the vault and farm approvals.
- No third-party scripts, styles, fonts, or analytics — every byte is
  same-origin and listed in `dist/integrity.json`.
- No COOP header on the vault: `Cross-Origin-Opener-Policy` would sever
  `window.opener` and break the handshake. (The protocol does not rely on
  opener isolation; it relies on origin checks + the private port.)
- **Honest caveat:** Ethereum's secp256k1 is not supported by WebCrypto, so
  the unlocked key is necessarily an extractable JS value in vault memory.
  CSP + minimal surface is the defense against XSS exfiltration; this is not
  hardware-grade key protection and we don't claim it is.

## Dev / tests

- Dashboard dev server: `:5173` (preview `:4173`); vault: `:5174` (preview
  `:4174`). On localhost the dashboard's vault origin can be overridden via
  `localStorage.amparo_vault_origin` (ignored everywhere else).
- The committed `dist/` build works on localhost unchanged — origin pairing is
  runtime-derived, not baked in at build time.
