// Which dashboard origin may talk to this vault. THE core access-control
// decision of the whole design: the vault only ever handshakes with, posts to,
// and takes requests from the origin this module allows.
//
// Derived at RUNTIME from the vault's own hostname — never from a query
// param, referrer, or message content (all attacker-controlled), and never
// baked in from env vars (which would make the committed bundle untestable
// and environment-specific):
//   vault.<apex>          -> exactly https://dashboard.<apex>
//   localhost / 127.0.0.1 -> any localhost origin (dev + headless tests only;
//                            this branch is unreachable when the real vault is
//                            served from vault.amparo.systems)
//   anything else         -> nothing (the vault refuses to pair)
//
// Pure functions of (origin, location) so they can be unit-tested in Node
// (scripts/test-origins.mjs) without a browser.

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function isLocalhostName(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

// The single dashboard origin this vault pairs with, or null when the rule is
// "any localhost origin" (dev), or '' when no origin is acceptable at all.
export function dashboardOriginFor(loc) {
  const h = loc.hostname
  if (h.startsWith('vault.') && h.length > 'vault.'.length) {
    return 'https://dashboard.' + h.slice('vault.'.length)
  }
  if (isLocalhostName(h)) return null
  return ''
}

export function isAllowedDashboardOrigin(origin, loc) {
  const want = dashboardOriginFor(loc)
  if (want === '') return false
  if (want === null) return LOCALHOST_RE.test(origin)
  return origin === want
}
