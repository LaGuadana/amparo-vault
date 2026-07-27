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

| kind           | mode       | result                                            |
| -------------- | ---------- | ------------------------------------------------- |
| `ping`         | any        | `{pong: true}`                                    |
| `status`       | any        | `{version, mode, unlocked, address}`              |
| `sign_typed`   | popup only | *(step 2+; approval UI decodes, then signs)*      |
| `sign_tx`      | popup only | *(step 2+)*                                       |
| `sign_message` | popup only | *(step 2+)*                                       |

Signing kinds return **only the signature** — never key material. Payloads
never carry secrets in either direction: the password is typed *into the
vault popup*, not sent over the channel.

## Guards on signing (in force since v1, before any signing exists)

1. **Popup only** — `popup_required` from an iframe.
2. **User gesture** — every signature requires a click on the approval screen
   *inside the vault popup*. The dashboard cannot fabricate that click; its own
   `userActivation` check is defense-in-depth only.
3. **Single-flight** — one pending approval at a time (`busy`).
4. **Rate limit** — 30 signing requests per rolling 5 minutes (enough for
   legitimate multi-step flows, far below silent-drain cadence); other kinds
   120 per minute (`rate_limited`).

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
