import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The vault's CSP travels WITH the bundle (meta tag) so it holds on any server,
// and is repeated as an HTTP header by deploy/Caddyfile, which adds the
// header-only frame-ancestors directive. Everything is same-origin: the vault
// loads no third-party script, style, font, or beacon — that is a load-bearing
// property (see PROTOCOL.md), not a styling choice.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Injected at build only: the dev server needs inline scripts for HMR/react
// refresh, and dev is not the trust surface — the committed dist/ is.
function injectCsp() {
  return {
    name: 'amparo-vault-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), injectCsp()],
  // 5174/4174: one above the dashboard's 5173/4173, so both run side by side.
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8000' },
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
})
