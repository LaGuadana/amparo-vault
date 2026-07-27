// Unit tests for the vault's origin-scoping logic — the pure functions of the
// trust boundary (src/origins.js message pairing + src/webauthn.js passkey RP
// scoping), exercised without a browser: node scripts/test-origins.mjs
// (also `npm test`).
import { strict as assert } from 'node:assert'
import { dashboardOriginFor, isAllowedDashboardOrigin } from '../src/origins.js'
import { rpIdFor } from '../src/webauthn.js'

const at = (hostname) => ({ hostname })
let n = 0
const ok = (cond, label) => { assert.ok(cond, label); n++ }

// Production: vault.amparo.systems pairs with dashboard.amparo.systems ONLY.
const prod = at('vault.amparo.systems')
ok(dashboardOriginFor(prod) === 'https://dashboard.amparo.systems', 'prod pairing')
ok(isAllowedDashboardOrigin('https://dashboard.amparo.systems', prod), 'prod dashboard allowed')
ok(!isAllowedDashboardOrigin('http://dashboard.amparo.systems', prod), 'plain http refused')
ok(!isAllowedDashboardOrigin('https://dashboard.amparo.systems.evil.com', prod), 'suffix spoof refused')
ok(!isAllowedDashboardOrigin('https://evil-dashboard.amparo.systems', prod), 'sibling subdomain refused')
ok(!isAllowedDashboardOrigin('https://amparo.systems', prod), 'apex refused')
ok(!isAllowedDashboardOrigin('http://localhost:5173', prod), 'localhost refused in prod')
ok(!isAllowedDashboardOrigin('null', prod), 'opaque origin refused')
ok(!isAllowedDashboardOrigin('', prod), 'empty origin refused')

// Any vault.<apex> deployment pairs with its own dashboard.<apex>.
const stage = at('vault.example.org')
ok(dashboardOriginFor(stage) === 'https://dashboard.example.org', 'generic apex pairing')
ok(!isAllowedDashboardOrigin('https://dashboard.amparo.systems', stage), 'cross-deployment refused')

// Dev/tests: a localhost vault accepts localhost origins only.
for (const host of ['localhost', '127.0.0.1']) {
  const dev = at(host)
  ok(dashboardOriginFor(dev) === null, `${host} -> dynamic localhost rule`)
  ok(isAllowedDashboardOrigin('http://localhost:5173', dev), `${host}: localhost:5173 allowed`)
  ok(isAllowedDashboardOrigin('http://127.0.0.1:4173', dev), `${host}: 127.0.0.1:4173 allowed`)
  ok(isAllowedDashboardOrigin('https://localhost:8443', dev), `${host}: https localhost allowed`)
  ok(!isAllowedDashboardOrigin('https://dashboard.amparo.systems', dev), `${host}: non-localhost refused`)
  ok(!isAllowedDashboardOrigin('http://localhost.evil.com:5173', dev), `${host}: localhost-prefix spoof refused`)
  ok(!isAllowedDashboardOrigin('null', dev), `${host}: opaque origin refused`)
}

// Anything that is neither vault.* nor localhost pairs with nothing.
for (const host of ['amparo.systems', 'dashboard.amparo.systems', 'vault.', 'example.com', '192.168.1.10']) {
  const loc = at(host)
  ok(dashboardOriginFor(loc) === '', `${host} -> no pairing`)
  ok(!isAllowedDashboardOrigin('https://dashboard.amparo.systems', loc), `${host}: refuses everything`)
  ok(!isAllowedDashboardOrigin('http://localhost:5173', loc), `${host}: refuses localhost too`)
}

// Passkey RP scoping: vault.<apex> passkeys bind to the apex so any amparo
// subdomain could assert them; localhost keeps the WebAuthn default.
ok(rpIdFor('vault.amparo.systems') === 'amparo.systems', 'passkey rpId scopes to apex')
ok(rpIdFor('vault.example.org') === 'example.org', 'generic apex scoping')
ok(rpIdFor('localhost') === undefined, 'localhost keeps WebAuthn default rp')
ok(rpIdFor('127.0.0.1') === undefined, '127.0.0.1 keeps WebAuthn default rp')
ok(rpIdFor('vault.') === 'vault.', 'degenerate hostname falls through unchanged')

console.log(`origins: ${n} assertions passed`)
