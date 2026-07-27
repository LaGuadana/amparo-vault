// Minimal EN/ES for the vault — same convention as the dashboard's i18n.jsx
// (the English source string IS the key, so untranslated strings fall back to
// English), but with no context/provider machinery: the store keeps `lang` and
// re-renders the tree, t() just reads the module variable. The dictionary is
// deliberately local to the vault: this directory gets open-sourced standalone.
// Translations shared with the dashboard were lifted verbatim from
// web/src/locales/es.js so the two surfaces speak identically.
const es = {
  // shell / standalone
  'This is amparo’s signing vault.': 'Esta es la bóveda de firmas de amparo.',
  'The vault is a small, open-source page on its own origin. It is where your password is entered, your wallet key is unlocked, and every transaction is approved and signed. The dashboard can only ask it for signatures — your key and password never leave this origin.':
    'La bóveda es una página pequeña y de código abierto en su propio origen. Aquí se introduce tu contraseña, se desbloquea la clave de tu billetera y se aprueba y firma cada transacción. El panel solo puede pedirle firmas — tu clave y tu contraseña nunca salen de este origen.',
  'You normally don’t open this page yourself: the dashboard opens it in a popup when something needs your approval. Always check the address bar reads this origin before typing your password here.':
    'Normalmente no abres esta página tú mismo: el panel la abre en una ventana emergente cuando algo necesita tu aprobación. Comprueba siempre que la barra de direcciones muestra este origen antes de escribir aquí tu contraseña.',
  'Connected to': 'Conectado a',
  'Waiting for the dashboard…': 'Esperando al panel…',
  'Waiting for requests from the dashboard. Nothing is signed without your approval on this page.':
    'Esperando solicitudes del panel. Nada se firma sin tu aprobación en esta página.',
  Wallet: 'Billetera',
  Unlocked: 'Desbloqueada',
  Locked: 'Bloqueada',

  // unlock
  'Unlock your wallet': 'Desbloquea tu billetera',
  'The dashboard requested a signature. Enter your password to unlock your wallet first — it never leaves this page.':
    'El panel ha solicitado una firma. Introduce tu contraseña para desbloquear tu billetera — nunca sale de esta página.',
  'The dashboard requested a signature. Enter your wallet PIN to unlock — it never leaves this page.':
    'El panel ha solicitado una firma. Introduce el PIN de tu billetera para desbloquearla — nunca sale de esta página.',
  'The dashboard requested a signature. Unlock with your device — Face ID, Touch ID or your fingerprint. Your key never leaves this page.':
    'El panel ha solicitado una firma. Desbloquea con tu dispositivo: Face ID, Touch ID o tu huella. Tu clave nunca sale de esta página.',
  'Unlock with Face ID / Touch ID': 'Desbloquear con Face ID / Touch ID',
  'Wallet PIN': 'PIN de la billetera',
  Password: 'Contraseña',
  Unlock: 'Desbloquear',
  'Unlocking…': 'Desbloqueando…',
  'Lost your device? Recover with your backup key': '¿Perdiste tu dispositivo? Recupera con tu clave de respaldo',
  'Forgot your PIN? Recover with your backup key': '¿Olvidaste tu PIN? Recupera con tu clave de respaldo',

  // approval
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
  none: 'ninguno',
  unknown: 'desconocido',
  Domain: 'Dominio',
  Type: 'Tipo',
  Contents: 'Contenido',
  'Technical details & raw payload': 'Detalles técnicos y contenido en bruto',

  // decoded transactions (decode.js)
  'Send {amount}': 'Enviar {amount}',
  Amount: 'Importe',
  Token: 'Token',
  Contract: 'Contrato',
  'Token approval': 'Aprobación de token',
  Spender: 'Autorizado',
  Allowance: 'Límite autorizado',
  Unlimited: 'Ilimitado',
  'An approval lets the spender move this token from your wallet later. Approve only if you just started this in the dashboard.':
    'Una aprobación permite al autorizado mover este token desde tu billetera más adelante. Aprueba solo si acabas de iniciar esto en el panel.',
  'Wrap {amount}': 'Envolver {amount}',
  'Unwrap wrapped token': 'Desenvolver token',
  'Contract call': 'Llamada a contrato',
  'The vault can’t decode this contract call. The exact bytes are below — approve only if you just started this action in the dashboard.':
    'La bóveda no puede descodificar esta llamada a contrato. Los bytes exactos están abajo — aprueba solo si acabas de iniciar esta acción en el panel.',
  '{amount} raw units of {address}': '{amount} unidades brutas de {address}',

  // decoded typed data (decode.js)
  Venue: 'Plataforma',
  Side: 'Lado',
  Buy: 'Comprar',
  Sell: 'Vender',
  Shares: 'Participaciones',
  'Limit price': 'Precio límite',
  '{price} / share': '{price} por participación',
  'You pay up to': 'Pagas como máximo',
  'You receive at least': 'Recibes como mínimo',
  'Outcome token': 'Token de resultado',
  'Venue fee': 'Comisión de la plataforma',
  'Buy {shares} shares — {venue}': 'Comprar {shares} participaciones — {venue}',
  'Sell {shares} shares — {venue}': 'Vender {shares} participaciones — {venue}',
  'Signed via': 'Firmado vía',
  'your deposit wallet': 'tu billetera de depósito',
  'Polymarket API access': 'Acceso API de Polymarket',
  Timestamp: 'Marca de tiempo',
  'Hyperliquid trading action': 'Acción de trading en Hyperliquid',
  'Action hash': 'Hash de la acción',
  'Hyperliquid {action}': 'Hyperliquid {action}',
  'Hyperliquid actions are hashed before signing, so the vault can’t show the order details — verify them on the dashboard screen you just used.':
    'Las acciones de Hyperliquid se firman como hash, así que la bóveda no puede mostrar los detalles de la orden — verifícalos en la pantalla del panel que acabas de usar.',
  'Swap on CoW Protocol': 'Intercambio en CoW Protocol',
  'Buy at least': 'Recibes al menos',
  Receiver: 'Destinatario',
  'Token permit — {name}': 'Permiso de token — {name}',
  Deadline: 'Fecha límite',
  'A permit is a gasless approval: it lets the spender move this token from your wallet later.':
    'Un permit es una aprobación sin gas: permite al autorizado mover este token desde tu billetera más adelante.',
  Stake: 'Apuesta',
  'Min odds': 'Cuota mínima',
  Expires: 'Expira',
  'Place bet — Azuro': 'Realizar apuesta — Azuro',
  'Place {n} bets — Azuro': 'Realizar {n} apuestas — Azuro',
  'Cash out — Azuro': 'Cash out — Azuro',
  'The vault doesn’t recognize this message format. The exact contents are below — approve only if you just started this action in the dashboard.':
    'La bóveda no reconoce este formato de mensaje. El contenido exacto está abajo — aprueba solo si acabas de iniciar esta acción en el panel.',

  // anti-phishing phrase
  'Pick a security phrase for this device. The real vault will always show it up here — a fake window can’t know it.':
    'Elige una frase de seguridad para este dispositivo. La bóveda auténtica siempre la mostrará aquí arriba — una ventana falsa no puede conocerla.',
  'Your security phrase — a window without it is not the real vault.':
    'Tu frase de seguridad — una ventana que no la muestre no es la bóveda auténtica.',
  'e.g. green teapot': 'p. ej. tetera verde',
  Save: 'Guardar',

  // auth (login/register + OTP)
  'Log in': 'Iniciar sesión',
  Register: 'Registrarse',
  'You are in amparo’s open-source vault — the only place your password is ever typed. Check the address bar before continuing.':
    'Estás en la bóveda de código abierto de amparo — el único lugar donde se escribe tu contraseña. Comprueba la barra de direcciones antes de continuar.',
  Email: 'Correo',
  'Date of birth': 'Fecha de nacimiento',
  'amparo is for adults only — you must be 18 or older.': 'amparo es solo para adultos — debes tener 18 años o más.',
  'Referral code (optional)': 'Código de referido (opcional)',
  'I have read and agree to the': 'He leído y acepto los',
  'Terms of Service': 'Términos del servicio',
  and: 'y',
  'Privacy Policy': 'Política de privacidad',
  '— the service is provided as-is, without warranty.': '— el servicio se ofrece tal cual, sin garantía.',
  'I agree': 'Acepto',
  'Create account': 'Crear cuenta',
  'We sent a 6-digit code to {email}.': 'Enviamos un código de 6 dígitos a {email}.',
  'New code sent to {email}.': 'Nuevo código enviado a {email}.',
  'Enter your code': 'Ingresa tu código',
  '6-digit code': 'Código de 6 dígitos',
  'Verifying…': 'Verificando…',
  'Verify & continue': 'Verificar y continuar',
  'Resend code': 'Reenviar código',

  // wallet setup / recovery
  'Set up your wallet': 'Configura tu billetera',
  'Your private key is created or imported here in the vault, encrypted with a PIN or passkey you choose, and only the ciphertext is stored. Neither amparo nor the dashboard ever sees your key.':
    'Tu clave privada se crea o importa aquí en la bóveda, se cifra con un PIN o una llave de acceso que tú eliges y solo se guarda el cifrado. Ni amparo ni el panel ven nunca tu clave.',
  'Your private key is created or imported here in the vault, encrypted with your account password, and only the ciphertext is stored. Neither amparo nor the dashboard ever sees your key.':
    'Tu clave privada se crea o importa aquí en la bóveda, se cifra con la contraseña de tu cuenta y solo se guarda el cifrado. Ni amparo ni el panel ven nunca tu clave.',
  'Generate new wallet': 'Generar nueva billetera',
  'Import existing key': 'Importar clave existente',
  'Your new wallet': 'Tu nueva billetera',
  Address: 'Dirección',
  'Address:': 'Dirección:',
  'Private key — shown once': 'Clave privada — se muestra una sola vez',
  'Private key': 'Clave privada',
  'Store this now. It is shown ONCE and cannot be recovered. Anyone with this key controls your funds.':
    'Guárdala ahora. Se muestra UNA SOLA VEZ y no se puede recuperar. Cualquiera con esta clave controla tus fondos.',
  'I have saved my private key somewhere safe': 'He guardado mi clave privada en un lugar seguro',
  'Download backup': 'Descargar copia de seguridad',
  'Account password (encrypts your wallet)': 'Contraseña de tu cuenta (cifra tu billetera)',
  'The same password you log in with — one password unlocks everything.':
    'La misma contraseña con la que inicias sesión: una sola contraseña lo desbloquea todo.',
  "That's not your account password. Use the exact password you log in with — one password unlocks both your account and your wallet.":
    'Esa no es la contraseña de tu cuenta. Usa exactamente la contraseña con la que inicias sesión: una sola contraseña desbloquea tu cuenta y tu billetera.',
  'Face ID / Touch ID': 'Face ID / Touch ID',
  'Use a PIN': 'Usar un PIN',
  'You’ll confirm with Face ID / Touch ID when you continue. Your device protects the wallet — nothing to remember, and the server never sees it. Keep your backup in case you lose the device.':
    'Confirmarás con Face ID / Touch ID al continuar. Tu dispositivo protege la billetera: nada que recordar y el servidor nunca lo ve. Guarda tu copia de seguridad por si pierdes el dispositivo.',
  'Choose a wallet PIN': 'Elige un PIN para la billetera',
  'At least 6 characters. It encrypts your wallet on this device, never reaches the server, and cannot be reset — so keep your backup.':
    'Al menos 6 caracteres. Cifra tu billetera en este dispositivo, nunca llega al servidor y no se puede restablecer, así que guarda tu copia de seguridad.',
  'Confirm PIN': 'Confirma el PIN',
  'Choose a PIN of at least 6 characters.': 'Elige un PIN de al menos 6 caracteres.',
  'Import wallet': 'Importar billetera',
  'Invalid private key': 'Clave privada no válida',
  Import: 'Importar',
  'Recover your wallet': 'Recupera tu billetera',
  'Paste the private key from your backup file to restore this wallet, then set a new way to unlock it.':
    'Pega la clave privada de tu archivo de copia de seguridad para restaurar esta billetera y luego elige una nueva forma de desbloquearla.',
  'Backup private key': 'Clave privada de respaldo',
  'This key doesn’t match your wallet on file.': 'Esta clave no coincide con tu billetera registrada.',
  'Restore wallet': 'Restaurar billetera',
  'Restoring…': 'Restaurando…',

  // account deletion
  'Delete my account': 'Eliminar mi cuenta',
  'This permanently erases the account {email} and everything stored with it, including the encrypted copy of your wallet key. It cannot be undone.':
    'Esto borra permanentemente la cuenta {email} y todo lo almacenado con ella, incluida la copia cifrada de la clave de tu billetera. No se puede deshacer.',
  'Google-account deletion isn’t self-service yet — contact support and we’ll erase it for you.':
    'La eliminación de cuentas de Google aún no es autoservicio — contacta con soporte y la borraremos por ti.',
  'Your password': 'Tu contraseña',
  'Deleting…': 'Eliminando…',

  // shared buttons
  Continue: 'Continuar',
  'Saving…': 'Guardando…',
  Back: 'Atrás',
  Cancel: 'Cancelar',
  Close: 'Cerrar',
  'Not now': 'Ahora no',
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
