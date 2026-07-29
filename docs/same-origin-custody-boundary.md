# Using the same-origin policy as a custody boundary

I build a browser-based trading terminal. The hardest problem in it was never
trading — it was answering a question I couldn't answer honestly for a long
time: **why should anyone believe a closed-source web app can't touch their
keys?**

The usual answers are "trust us" or "install our extension." This is a writeup
of a third option, the reasoning behind it, and the places where it doesn't
reach as far as I'd like. The code is MIT and the threat model is in
[PROTOCOL.md](../PROTOCOL.md).

## The shape of the idea

Everything able to touch money — password entry, key generation and unlock,
every signature — lives in a small app on **its own origin**
(`vault.amparo.systems`). The main dashboard is a separate, proprietary app on
a different origin. It can *ask* the vault for a signature over a message
channel. It cannot read the key, the password, or anything else in the vault's
storage, because the browser won't let it.

That's it. The security boundary is the same-origin policy — a primitive every
browser has enforced for twenty years, rather than something I invented.

What makes it more than a diagram is the part where you don't have to take my
word for any of it: the vault is open source, its deployed bundle is committed
and hash-pinned, and you can check the live page serves exactly those bytes.

## Deriving the counterparty from your own hostname

The first thing that goes wrong in postMessage designs is trusting the message
to tell you who sent it. Both sides here derive their counterparty **at runtime
from their own hostname** — never from message content, query parameters, or
referrers:

| This page runs on         | It will only pair with             |
| ------------------------- | ---------------------------------- |
| `vault.<apex>`            | `https://dashboard.<apex>`         |
| `dashboard.<apex>`        | `https://vault.<apex>`             |
| `localhost` / `127.0.0.1` | localhost origins (dev/tests only) |
| anything else             | nothing                            |

On receive, `event.origin` must exact-match **and** `event.source` must be the
window that opened or embeds the vault (`window.opener` / `window.parent`).
On send, an explicit `targetOrigin`, never `"*"`. The vault **pins** the
dashboard origin on the first valid hello and ignores every other origin for
the lifetime of the document.

The handshake itself is a `MessageChannel`, and the detail I like most is why
it answers **once per nonce**: a port can only be transferred once, so a
replayed hello must not be allowed to mint a second channel. After the
handshake, all traffic runs over that private pair-connected port, and the
vault never acts on window-level messages other than `hello`. There is no
window for a third frame to shout into.

## Popup, not iframe — because an iframe has no address bar

This is the decision I'd defend hardest.

An embedded iframe has no URL bar. A compromised dashboard could therefore draw
a pixel-perfect fake of the vault: same fonts, same layout, same reassuring
padlock iconography, and a password field that posts wherever it likes. Every
cryptographic control downstream is irrelevant if the user typed their password
into a `<div>`.

So password entry and every approval happen in a **popup with a real address
bar**. You can always check it reads `vault.amparo.systems` before typing.
A hidden iframe is used only for silent, non-trust operations like liveness
checks, and the vault refuses signing requests that arrive from an iframe at
all (`popup_required`). A top-level popup also gets first-party storage, which
sidesteps third-party partitioning entirely.

The address bar is necessary but not sufficient — people don't read it. So
there's a second signal: a **per-device security phrase** you choose on first
use, displayed on every genuine vault screen. A fake window can't know it,
because it was never in the dashboard's storage to steal.

## The approval screen decodes what it will sign

This is the linchpin, and the one I'd most like people to attack.

The vault renders meaning — recipient, amount, asset, market, side — **from the
exact object it is about to sign, and from nothing else.** No dashboard-supplied
label or description is ever displayed. A lying `description` field is the
oldest wallet-phishing trick there is, and the only durable fix is to never
render one.

Decoded natively: ERC-20 transfers and approvals, native sends, wrap/unwrap,
CLOB orders (side, shares, limit price, total — including Solady
`TypedDataSign` wraps), CoW swaps, EIP-2612 permits, on-chain bets and
cash-outs, and typed transactions. Unknown tokens degrade to raw units plus the
contract address rather than a guess. Hyperliquid L1 actions are hashed before
signing by design, so the vault says so plainly instead of pretending to decode
them. Anything unrecognised is shown verbatim with a warning. Nothing is signed
blind, and the raw payload is always one `<details>` away.

Around that sit four guards, in force since v1:

1. **Popup only** — signing from an iframe is refused.
2. **Real user gesture** — every signature needs a click on the approval screen
   *inside the vault popup*. The dashboard cannot fabricate that click; its own
   activation check is defence-in-depth only.
3. **Single-flight** — one pending approval at a time.
4. **Rate limit** — 30 signing requests per rolling five minutes. Enough for
   legitimate multi-step flows, far below any silent-drain cadence.

## Reproducible, hash-pinned deploys

An open-source client you can't verify is running is a promise, not a control.
The built bundle is committed to the repo with a SHA-256 manifest
(`dist/integrity.json`) and Subresource Integrity attributes the browser
enforces. Two checks, neither of which needs my cooperation:

```bash
# 1. the committed bundle really compiles from this source, byte for byte
nvm use && npm ci && npm run build
git diff --exit-code dist/

# 2. the live site serves exactly that bundle — nothing injected
npm run verify-site https://vault.amparo.systems
```

The important subtlety is in the second one: `verify-site` compares every
served file against the manifest **in your local checkout**, never one fetched
from the live site. A manifest downloaded from the server you're auditing
proves nothing.

Page hygiene carries the rest. CSP `default-src 'none'; script-src 'self'` is
baked into the built `index.html` as a meta tag and repeated as an HTTP header,
where it can add `frame-ancestors` so no other site can embed the vault and
farm approvals. No third-party scripts, styles, fonts, or analytics — ever.
Every byte is same-origin and listed in the manifest.

One deliberate omission: **there is no COOP header on the vault.**
`Cross-Origin-Opener-Policy` would sever `window.opener` and break the
handshake. The protocol doesn't rely on opener isolation; it relies on the
origin checks and the private port. I'd rather state that than have someone
find a missing header and assume it was an oversight.

## Where this doesn't reach

If you only read one section, read this one.

**It is not end-to-end verifiable.** The checks above prove the live site
matches this source *at the moment you run them*. Between checks, you are
trusting me and my host to keep serving those bytes. The honest claim is
auditable source, a reproducible build, and a spot-check you can run any time —
not a cryptographic guarantee. A transparency log, or a Code-Verify-style
in-browser check, would close this. Neither exists here yet, and at this size
I'm genuinely unsure whether the complexity is worth it.

**The key is an extractable value in page memory while unlocked.** Ethereum's
secp256k1 isn't supported by WebCrypto, so non-extractable keys simply aren't
available to me. The defences are the strict CSP, a deliberately small
dependency surface, no third-party anything, and the popup's short lifetime.
That is a real mitigation against XSS exfiltration and it is *not*
hardware-wallet-grade key protection. I don't claim it is.

**A password-encrypted wallet is only as strong as the password.** 600k PBKDF2
rounds slow guessing down; they don't fix a weak password. Passkey-protected
wallets use the authenticator's PRF secret instead — nothing to guess — at the
cost of a backup key you must actually keep.

**The boundary protects the key, not the user's judgement.** A compromised
dashboard can still ask for a signature over something legitimate-looking. The
decoder is what narrows that, and the decoder is code I wrote, so it is exactly
as good as its coverage.

## What I'd like torn apart

Three things, in order of how much they'd change my design:

1. **Holes in the popup-spoofing defence.** Address bar plus per-device phrase
   is what I have. What defeats it?
2. **The decoder's coverage.** It is the linchpin and it is a hand-maintained
   allowlist. What would you sign past it?
3. **Whether a transparency log is worth the complexity** at this scale, or
   whether the spot-check is the honest stopping point.

Source, threat model and the unit tests for the trust boundary — origin pairing,
passkey RP scoping, payload decoding — are all in the repo:
<https://github.com/LaGuadana/amparo-vault>
