// Post-build integrity pass. Runs automatically after `vite build`.
//
// What it does, and why it matters for trust:
//   1. Injects Subresource Integrity (SRI) hashes into dist/index.html, so a
//      user's browser REFUSES to run any script/style whose bytes don't match
//      the hash baked into the page at build time.
//   2. Writes dist/integrity.json — a manifest of SHA-256 (hex) and SHA-384
//      (base64) digests for every file in the bundle. Because dist/ is committed
//      to the open-source repo, anyone can (a) rebuild from source and confirm
//      the bundle reproduces, and (b) run scripts/verify-site.mjs against the
//      LIVE deployment to confirm the server is serving exactly this bundle and
//      nothing else. That is what turns "we're open source" into something a
//      user can actually check, rather than take on faith.
//
// Deterministic on purpose: no timestamps, no build IDs, sorted keys — so the
// manifest is byte-reproducible from the same source + toolchain.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const MANIFEST = join(DIST, 'integrity.json')

const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex')
const sha384sri = (buf) => 'sha384-' + createHash('sha384').update(buf).digest('base64')

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

// 1) Inject SRI into index.html BEFORE hashing, so the manifest records the
//    final served bytes of index.html too.
const indexPath = join(DIST, 'index.html')
let html = readFileSync(indexPath, 'utf8')

// map "/assets/foo.js" -> its SRI digest
const sriFor = (urlPath) => {
  const rel = urlPath.replace(/^\//, '')
  try {
    return sha384sri(readFileSync(join(DIST, rel)))
  } catch {
    return null // external URL (fonts, CDN) — can't/shouldn't pin here
  }
}

// Vite already stamps `crossorigin` on these tags; only add it when missing, so
// we never emit a duplicate attribute.
const crossorigin = (tag) => (/\bcrossorigin\b/.test(tag) ? '' : ' crossorigin="anonymous"')

// <script type="module" src="/assets/xxx.js"></script>
html = html.replace(/<script\b([^>]*?)\bsrc="(\/[^"]+)"([^>]*)><\/script>/g,
  (m, pre, src, post) => {
    if (/\bintegrity=/.test(m)) return m
    const sri = sriFor(src)
    return sri ? `<script${pre}src="${src}"${post} integrity="${sri}"${crossorigin(m)}></script>` : m
  })

// <link rel="stylesheet" href="/assets/xxx.css">
html = html.replace(/<link\b([^>]*?)\brel="stylesheet"([^>]*?)\bhref="(\/[^"]+)"([^>]*?)>/g,
  (m) => {
    if (/\bintegrity=/.test(m)) return m
    const href = m.match(/\bhref="(\/[^"]+)"/)?.[1]
    const sri = href && sriFor(href)
    return sri ? m.replace('>', ` integrity="${sri}"${crossorigin(m)}>`) : m
  })

writeFileSync(indexPath, html)

// 2) Hash every file (including the just-rewritten index.html) into the manifest.
const files = {}
for (const full of walk(DIST)) {
  if (full === MANIFEST) continue
  const buf = readFileSync(full)
  const key = relative(DIST, full).split('\\').join('/')
  files[key] = { sha256: sha256hex(buf), sha384: sha384sri(buf), bytes: buf.length }
}

const manifest = {
  _comment: 'SHA-256 (hex) and SHA-384 (SRI) digests of every file in the amparo vault bundle. '
    + 'Rebuild from source (npm ci && npm run build) to reproduce; run scripts/verify-site.mjs '
    + '<url> to confirm a live deployment serves exactly these bytes.',
  algorithm: { sha256: 'hex', sha384: 'base64 (SRI subresource-integrity form)' },
  files: Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]])),
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')

const n = Object.keys(files).length
console.log(`integrity: SRI injected into index.html; manifest written for ${n} files -> dist/integrity.json`)
