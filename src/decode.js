// Payload decoding for the approval screen — the linchpin control: the vault
// renders MEANING (recipient, amount, asset, market, side) from the exact
// object it will sign, and from nothing else. No dashboard-supplied labels,
// no re-fetching. What can't be decoded is shown verbatim with a warning —
// bytes on screen, never a blind "trust me" blob.
//
// Pure functions of the payload (unit-tested in scripts/test-decode.mjs).
// They take an optional translate function (i18n.t) so every label the user
// reads is localized; the default is English pass-through with {var}
// interpolation, which is also what the Node tests exercise.
//
// Registries are deliberately conservative: every address was copied from
// this repo's backend services (the code that BUILDS these payloads), and an
// unknown token/venue degrades to raw units + address rather than a guess —
// a wrong label would be worse than none.
import { AbiCoder, MaxUint256 } from 'ethers'

const abi = AbiCoder.defaultAbiCoder()

const defaultT = (key, vars) =>
  vars ? String(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : key

export const CHAINS = {
  1: { name: 'Ethereum', symbol: 'ETH' },
  100: { name: 'Gnosis', symbol: 'xDAI' },
  137: { name: 'Polygon', symbol: 'POL' },
  8453: { name: 'Base', symbol: 'ETH' },
  42161: { name: 'Arbitrum', symbol: 'ETH' },
}

// address (lowercase) -> {symbol, decimals}. Sources: app/config.py,
// app/services/{cow,funding,license,pendle}.py, services/markets/*.
const TOKENS = {
  // Polygon
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', decimals: 6 },
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6 },
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', decimals: 18 },
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': { symbol: 'WPOL', decimals: 18 },
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 },
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': { symbol: 'WBTC', decimals: 8 },
  // Arbitrum
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6 },
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': { symbol: 'USDC.e', decimals: 6 },
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', decimals: 18 },
  '0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB', decimals: 18 },
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': { symbol: 'WBTC', decimals: 8 },
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },
  // Base
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', decimals: 8 },
  // Ethereum
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
}

export const short = (s) => {
  const str = String(s ?? '')
  return str.length > 14 ? str.slice(0, 8) + '…' + str.slice(-6) : str
}

// bigint-ish -> trimmed decimal string ("5", "0.001", "12.5")
export function fmtUnits(value, decimals) {
  let v
  try { v = BigInt(value ?? 0) } catch { return String(value) }
  const neg = v < 0n
  if (neg) v = -v
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '')
}

function tokenFor(address) {
  return TOKENS[String(address || '').toLowerCase()] || null
}

// "12.5 USDC" for known tokens, honest raw units otherwise.
export function fmtToken(address, amount, t = defaultT) {
  const tok = tokenFor(address)
  if (tok) return `${fmtUnits(amount, tok.decimals)} ${tok.symbol}`
  return t('{amount} raw units of {address}', { amount: String(amount), address: short(address) })
}

const chainName = (id) => (CHAINS[Number(id)] ? `${CHAINS[Number(id)].name} (${Number(id)})` : `chain ${Number(id)}`)
const nativeSymbol = (id) => CHAINS[Number(id)]?.symbol || ''

const UNLIMITED_FLOOR = MaxUint256 >> 1n // anything this large is effectively unlimited

// ---- transactions -----------------------------------------------------------
// Returns {title, rows, techRows, warning?}. `rows` carry the meaning; the UI
// shows techRows (nonce/gas/data) collapsed, plus the raw payload verbatim.
export function decodeTx(tx, t = defaultT) {
  const row = (label, value, raw = false) => ({ label: raw ? label : t(label), value: String(value) })
  const chainId = Number(tx.chainId)
  const value = (() => { try { return BigInt(tx.value ?? 0) } catch { return 0n } })()
  const data = typeof tx.data === 'string' && tx.data.length > 2 ? tx.data : null
  const techRows = [
    row('Chain', chainName(chainId)),
    row('Nonce', tx.nonce),
    row('Gas limit', tx.gas),
    row('Data', data ? `${data.slice(0, 10)}… (${(data.length - 2) / 2} bytes)` : t('none')),
  ]
  const out = (title, rows, warning) => ({ title, rows, techRows, warning })
  const args = (types) => abi.decode(types, '0x' + data.slice(10))
  const native = `${fmtUnits(value, 18)} ${nativeSymbol(chainId)}`

  try {
    if (!data) {
      return out(t('Send {amount}', { amount: native }), [
        row('To', tx.to),
        row('Amount', native),
        row('Chain', chainName(chainId)),
      ])
    }
    const selector = data.slice(0, 10).toLowerCase()
    if (selector === '0xa9059cbb') { // transfer(address,uint256)
      const [to, amount] = args(['address', 'uint256'])
      return out(t('Send {amount}', { amount: fmtToken(tx.to, amount, t) }), [
        row('To', to),
        row('Amount', fmtToken(tx.to, amount, t)),
        row('Token', `${tokenFor(tx.to)?.symbol || t('unknown')} · ${tx.to}`),
        row('Chain', chainName(chainId)),
      ])
    }
    if (selector === '0x095ea7b3') { // approve(address,uint256)
      const [spender, amount] = args(['address', 'uint256'])
      const unlimited = BigInt(amount) >= UNLIMITED_FLOOR
      return out(t('Token approval'), [
        row('Spender', spender),
        row('Allowance', unlimited ? t('Unlimited') : fmtToken(tx.to, amount, t)),
        row('Token', `${tokenFor(tx.to)?.symbol || t('unknown')} · ${tx.to}`),
        row('Chain', chainName(chainId)),
      ], t('An approval lets the spender move this token from your wallet later. Approve only if you just started this in the dashboard.'))
    }
    if (selector === '0xd0e30db0') { // deposit() — wrap native
      return out(t('Wrap {amount}', { amount: native }), [
        row('Contract', tx.to),
        row('Amount', native),
        row('Chain', chainName(chainId)),
      ])
    }
    if (selector === '0x2e1a7d4d') { // withdraw(uint256) — unwrap
      const [amount] = args(['uint256'])
      return out(t('Unwrap wrapped token'), [
        row('Contract', tx.to),
        row('Amount', fmtToken(tx.to, amount, t)),
        row('Chain', chainName(chainId)),
      ])
    }
  } catch { /* malformed args — fall through to the verbatim view */ }

  const rows = [row('To', tx.to), row('Chain', chainName(chainId))]
  if (value > 0n) rows.splice(1, 0, row('Value', native))
  return out(t('Contract call'), rows,
    t('The vault can’t decode this contract call. The exact bytes are below — approve only if you just started this action in the dashboard.'))
}

// ---- EIP-712 typed data -----------------------------------------------------

// CLOB prediction-market order (Polymarket / Limitless — same struct family).
// Amounts are 6-decimals on both venues; side 0 = buy, 1 = sell.
function decodeClobOrder(domain, msg, t) {
  const row = (label, value) => ({ label: t(label), value: String(value) })
  const venue = domain?.name || 'CTF exchange'
  const side = Number(msg.side)
  const maker = BigInt(msg.makerAmount)
  const taker = BigInt(msg.takerAmount)
  const usdc = side === 0 ? maker : taker
  const shares = side === 0 ? taker : maker
  const price = shares > 0n ? Number(usdc) / Number(shares) : 0
  const rows = [
    row('Venue', venue),
    row('Side', side === 0 ? t('Buy') : t('Sell')),
    row('Shares', fmtUnits(shares, 6)),
    row('Limit price', t('{price} / share', { price: '$' + price.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') })),
    row(side === 0 ? 'You pay up to' : 'You receive at least', `${fmtUnits(usdc, 6)} USDC`),
    row('Outcome token', short(msg.tokenId)),
  ]
  if (msg.feeRateBps != null && Number(msg.feeRateBps) > 0) rows.push(row('Venue fee', `${Number(msg.feeRateBps) / 100}%`))
  return {
    title: t(side === 0 ? 'Buy {shares} shares — {venue}' : 'Sell {shares} shares — {venue}',
      { shares: fmtUnits(shares, 6), venue }),
    rows,
  }
}

export function decodeTyped(td, t = defaultT) {
  const row = (label, value, raw = false) => ({ label: raw ? label : t(label), value: String(value) })
  const { domain = {}, primaryType, message = {} } = td || {}
  const name = domain.name || ''
  const out = (title, rows, warning) => ({ title, rows, warning })

  try {
    // Deposit-wallet orders arrive Solady-wrapped: the ORDER is the content.
    if (primaryType === 'TypedDataSign' && message.contents && td.types?.Order) {
      const inner = decodeClobOrder(domain, message.contents, t)
      inner.rows.push(row('Signed via', t('your deposit wallet')))
      return inner
    }
    if (primaryType === 'Order' && message.makerAmount != null && message.side != null) {
      return decodeClobOrder(domain, message, t)
    }
    if (primaryType === 'ClobAuth') {
      return out(t('Polymarket API access'), [
        row('Wallet', message.address || '—'),
        row('Timestamp', message.timestamp || '—'),
      ], undefined)
    }
    if (name === 'Exchange' && primaryType === 'Agent') {
      return out(t('Hyperliquid trading action'), [
        row('Action hash', short(message.connectionId)),
      ], t('Hyperliquid actions are hashed before signing, so the vault can’t show the order details — verify them on the dashboard screen you just used.'))
    }
    if (name === 'HyperliquidSignTransaction') {
      const label = String(primaryType || '').replace(/^HyperliquidTransaction:/, '')
      return out(t('Hyperliquid {action}', { action: label || 'transaction' }),
        Object.entries(message).map(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : v, true)))
    }
    if (name === 'Gnosis Protocol' && primaryType === 'Order') {
      return out(t('Swap on CoW Protocol'), [
        row('Sell', fmtToken(message.sellToken, message.sellAmount, t)),
        row('Buy at least', fmtToken(message.buyToken, message.buyAmount, t)),
        row('Receiver', message.receiver),
        row('Chain', chainName(domain.chainId)),
      ])
    }
    if (primaryType === 'Permit' && message.spender) {
      const unlimited = (() => { try { return BigInt(message.value) >= UNLIMITED_FLOOR } catch { return false } })()
      return out(t('Token permit — {name}', { name: name || 'token' }), [
        row('Spender', message.spender),
        row('Allowance', unlimited ? t('Unlimited') : String(message.value)),
        row('Deadline', message.deadline),
      ], t('A permit is a gasless approval: it lets the spender move this token from your wallet later.'))
    }
    if (name === 'Live Betting' && primaryType === 'ClientBetData') {
      const bets = Array.isArray(message.bets) ? message.bets : []
      const rows = [row('Venue', 'Azuro')]
      bets.forEach((b, i) => {
        const p = bets.length > 1 ? `#${i + 1} ` : ''
        rows.push({ label: p + t('Stake'), value: `${fmtUnits(b.amount, 6)} USDT` })
        rows.push({ label: p + t('Min odds'), value: fmtUnits(b.minOdds, 12) })
      })
      if (message.clientData?.expiresAt) rows.push(row('Expires', message.clientData.expiresAt))
      return out(bets.length > 1
        ? t('Place {n} bets — Azuro', { n: bets.length })
        : t('Place bet — Azuro'), rows)
    }
    if (name === 'Cash Out' && primaryType === 'CashOutOrder') {
      return out(t('Cash out — Azuro'),
        Object.entries(message).map(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : v, true)))
    }
  } catch { /* malformed message — fall through to the verbatim view */ }

  return out(name ? `${name} — ${primaryType || t('Typed message')}` : t('Typed message'), [
    row('Domain', [name, domain.version].filter(Boolean).join(' v') || '—'),
    ...(domain.chainId != null ? [row('Chain', chainName(domain.chainId))] : []),
    row('Type', primaryType || '—'),
  ], t('The vault doesn’t recognize this message format. The exact contents are below — approve only if you just started this action in the dashboard.'))
}
