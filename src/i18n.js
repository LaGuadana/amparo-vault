// Minimal EN/ES for the vault — same convention as the dashboard's i18n.jsx
// (the English source string IS the key, so untranslated strings fall back to
// English), but with no context/provider machinery: the store keeps `lang` and
// re-renders the tree, t() just reads the module variable. The dictionary is
// deliberately local to the vault: this directory gets open-sourced standalone.
const es = {
  'This is amparo’s signing vault.': 'Esta es la bóveda de firmas de amparo.',
  'The vault is a small, open-source page on its own origin. It is where your password is entered, your wallet key is unlocked, and every transaction is approved and signed. The dashboard can only ask it for signatures — your key and password never leave this origin.':
    'La bóveda es una página pequeña y de código abierto en su propio origen. Aquí se introduce tu contraseña, se desbloquea la clave de tu wallet y se aprueba y firma cada transacción. El panel solo puede pedirle firmas — tu clave y tu contraseña nunca salen de este origen.',
  'You normally don’t open this page yourself: the dashboard opens it in a popup when something needs your approval. Always check the address bar reads this origin before typing your password here.':
    'Normalmente no abres esta página tú mismo: el panel la abre en una ventana emergente cuando algo necesita tu aprobación. Comprueba siempre que la barra de direcciones muestra este origen antes de escribir aquí tu contraseña.',
  'Connected to': 'Conectado a',
  'Waiting for the dashboard…': 'Esperando al panel…',
  'Waiting for requests from the dashboard. Nothing is signed without your approval on this page.':
    'Esperando solicitudes del panel. Nada se firma sin tu aprobación en esta página.',
  'Unlock your wallet': 'Desbloquea tu wallet',
  'The dashboard requested a signature. Enter your password to unlock your wallet first — it never leaves this page.':
    'El panel ha solicitado una firma. Introduce tu contraseña para desbloquear tu wallet — nunca sale de esta página.',
  Password: 'Contraseña',
  'Unlock': 'Desbloquear',
  'Unlocking…': 'Desbloqueando…',
  'Signature request': 'Solicitud de firma',
  'Review what will be signed. Approving signs exactly what is shown here — nothing else.':
    'Revisa lo que se va a firmar. Al aprobar se firma exactamente lo que se muestra aquí — nada más.',
  Approve: 'Aprobar',
  'Approve & sign': 'Aprobar y firmar',
  Reject: 'Rechazar',
  'Signing…': 'Firmando…',
  Transaction: 'Transacción',
  'Typed message': 'Mensaje tipado',
  Message: 'Mensaje',
  To: 'Para',
  Value: 'Importe',
  Chain: 'Red',
  'Gas limit': 'Límite de gas',
  Nonce: 'Nonce',
  Data: 'Datos',
  'no data': 'sin datos',
  '{n} bytes': '{n} bytes',
  Domain: 'Dominio',
  Type: 'Tipo',
  Contents: 'Contenido',
  Wallet: 'Wallet',
  Unlocked: 'Desbloqueada',
  Locked: 'Bloqueada',
}

const DICTS = { es }
const SUPPORTED = ['en', 'es']
const LS_KEY = 'amparo_lang' // vault-origin copy; seeded by the dashboard's session message

let lang = (() => {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (SUPPORTED.includes(saved)) return saved
  } catch { /* private mode */ }
  const nav = ((typeof navigator !== 'undefined' && navigator.language) || 'en').toLowerCase()
  return nav.startsWith('es') ? 'es' : 'en'
})()

export const getLang = () => lang

export function setLang(next) {
  if (!SUPPORTED.includes(next) || next === lang) return false
  lang = next
  try { localStorage.setItem(LS_KEY, next) } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  return true
}

export function t(key, vars) {
  const dict = DICTS[lang]
  const str = (dict && dict[key]) || key
  if (!vars) return str
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
