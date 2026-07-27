// Independent verification of a live amparo VAULT deployment.
//
//   node scripts/verify-site.mjs https://app.example.com
//
// Fetches every file in the deployment and checks its SHA-256 against the
// committed manifest (dist/integrity.json) from THIS checkout of the source.
// If every hash matches, the server is provably serving the exact open-source
// bundle in this repo — no injected key-logger, no swapped crypto, nothing.
//
// Trust note: the manifest is read from your local clone of the SOURCE, never
// from the live site — otherwise a hostile server could serve a matching fake.
// For a full chain of custody, first reproduce the bundle yourself:
//   npm ci && npm run build && git diff --exit-code dist/
// A clean diff means dist/ genuinely came from the source you're reading.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = (process.argv[2] || '').replace(/\/+$/, '')
if (!base) {
  console.error('usage: node scripts/verify-site.mjs <https://deployment-url>')
  process.exit(2)
}

const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'integrity.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex')

// index.html is served at "/"; everything else at "/<key>".
const urlFor = (key) => (key === 'index.html' ? `${base}/` : `${base}/${key}`)

let ok = 0
let bad = 0
for (const [key, meta] of Object.entries(manifest.files)) {
  const url = urlFor(key)
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) { console.log(`FAIL  ${key}  (HTTP ${res.status})`); bad++; continue }
    const got = sha256hex(Buffer.from(await res.arrayBuffer()))
    if (got === meta.sha256) { console.log(`ok    ${key}`); ok++ }
    else { console.log(`FAIL  ${key}\n        expected ${meta.sha256}\n        served   ${got}`); bad++ }
  } catch (e) {
    console.log(`FAIL  ${key}  (${e.message})`); bad++
  }
}

console.log(`\n${ok} matched, ${bad} mismatched, of ${Object.keys(manifest.files).length} files`)
if (bad) {
  console.log('\n⚠  The live deployment is NOT serving the bundle in this repo. Do not trust it with keys.')
  process.exit(1)
}
console.log('\n✓  The live deployment matches the open-source bundle exactly.')
