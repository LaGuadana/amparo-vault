// Unit tests for the approval-screen decoders (src/decode.js) — pure
// functions, run in Node: node scripts/test-decode.mjs (part of `npm test`).
import { strict as assert } from 'node:assert'
import { decodeTx, decodeTyped, fmtUnits } from '../src/decode.js'

let n = 0
const ok = (cond, label) => { assert.ok(cond, label); n++ }
const text = (d) => JSON.stringify(d)

// ---- units ------------------------------------------------------------------
ok(fmtUnits('5000000', 6) === '5', 'fmtUnits whole')
ok(fmtUnits('1000000000000000', 18) === '0.001', 'fmtUnits fraction')
ok(fmtUnits('12500000', 6) === '12.5', 'fmtUnits trims zeros')

// ---- transactions -----------------------------------------------------------
const USDC_POLY = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const transfer = decodeTx({
  to: USDC_POLY,
  data: '0xa9059cbb' + '33'.repeat(20).padStart(64, '0') + (5_000_000).toString(16).padStart(64, '0'),
  value: 0, nonce: 7, gas: 65000, chainId: 137,
})
ok(transfer.title === 'Send 5 USDC', 'ERC-20 transfer decodes amount+symbol')
ok(text(transfer.rows).includes('0x3333333333333333333333333333333333333333'), 'transfer shows recipient')
ok(text(transfer.rows).includes('Polygon (137)'), 'transfer shows chain')

const approve = decodeTx({
  to: USDC_POLY,
  data: '0x095ea7b3' + '44'.repeat(20).padStart(64, '0') + 'f'.repeat(64),
  value: 0, nonce: 1, gas: 60000, chainId: 137,
})
ok(approve.title === 'Token approval', 'approve recognized')
ok(text(approve.rows).includes('Unlimited'), 'max approval flagged Unlimited')
ok(/move this token/.test(approve.warning), 'approve carries its warning')

const native = decodeTx({ to: '0x' + '22'.repeat(20), data: '0x', value: '1000000000000000', nonce: 0, gas: 21000, chainId: 137 })
ok(native.title === 'Send 0.001 POL', 'native send decodes')

const unknown = decodeTx({ to: '0x' + '55'.repeat(20), data: '0xdeadbeef1234', value: 0, nonce: 0, gas: 100000, chainId: 42161 })
ok(unknown.title === 'Contract call' && /can’t decode/.test(unknown.warning), 'unknown call falls back with warning')
ok(text(unknown.techRows).includes('0xdeadbeef'), 'unknown call still shows the selector bytes')

// ---- typed data -------------------------------------------------------------
const pmOrder = decodeTyped({
  primaryType: 'Order',
  domain: { name: 'Polymarket CTF Exchange', version: '2', chainId: 137 },
  types: {},
  message: {
    salt: '1', maker: '0x' + '11'.repeat(20), signer: '0x' + '11'.repeat(20),
    tokenId: '1234567890123456789', makerAmount: '4200000', takerAmount: '10000000',
    side: 0, signatureType: 0, timestamp: '0', metadata: '0x' + '00'.repeat(32), builder: '0x' + '00'.repeat(32),
  },
})
ok(pmOrder.title === 'Buy 10 shares — Polymarket', 'PM buy order title reads as the venue, not the contract')
ok(text(pmOrder.rows).includes('$0.42 / share'), 'PM order derives the limit price')
ok(text(pmOrder.rows).includes('4.2 USDC'), 'PM order shows max cost')

const llSell = decodeTyped({
  primaryType: 'Order',
  domain: { name: 'Limitless CTF Exchange', version: '1', chainId: 8453 },
  types: {},
  message: { tokenId: '9', makerAmount: '10000000', takerAmount: '6500000', side: 1, feeRateBps: '100' },
})
ok(llSell.title === 'Sell 10 shares — Limitless', 'Limitless sell order title reads as the venue')
ok(text(llSell.rows).includes('6.5 USDC'), 'sell shows proceeds floor')
ok(text(llSell.rows).includes('1%'), 'venue fee shown')

const wrapped = decodeTyped({
  primaryType: 'TypedDataSign',
  domain: { name: 'Polymarket CTF Exchange', version: '2', chainId: 137 },
  types: { Order: [] },
  message: { contents: { tokenId: '5', makerAmount: '1000000', takerAmount: '2000000', side: 0 }, name: 'x' },
})
ok(wrapped.title.startsWith('Buy 2 shares'), 'deposit-wallet wrapped order unwraps to the inner order')
ok(text(wrapped.rows).includes('deposit wallet'), 'wrap noted')

const hl = decodeTyped({
  primaryType: 'Agent',
  domain: { name: 'Exchange', version: '1', chainId: 1337 },
  types: {},
  message: { source: 'a', connectionId: '0x' + 'ab'.repeat(32) },
})
ok(hl.title === 'Hyperliquid trading action', 'HL agent action recognized')
ok(/hashed before signing/.test(hl.warning), 'HL hash caveat stated honestly')

const cow = decodeTyped({
  primaryType: 'Order',
  domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 42161 },
  types: {},
  message: {
    sellToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', buyToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    sellAmount: '25000000', buyAmount: '7000000000000000', receiver: '0x' + '11'.repeat(20),
    validTo: 1700000000, kind: 'sell',
  },
})
ok(cow.title === 'Swap on CoW Protocol', 'CoW order recognized')
ok(text(cow.rows).includes('25 USDC') && text(cow.rows).includes('0.007 WETH'), 'CoW amounts decode with symbols')

const azuro = decodeTyped({
  primaryType: 'ClientBetData',
  domain: { name: 'Live Betting', version: '1.0.0', chainId: 137 },
  types: {},
  message: {
    clientData: { attention: '', affiliate: '0x' + '00'.repeat(20), core: '0x' + '00'.repeat(20), expiresAt: '1700000000' },
    bets: [{ conditionId: '1', outcomeId: '29', minOdds: '1850000000000', amount: '10000000' }],
  },
})
ok(azuro.title === 'Place bet — Azuro', 'Azuro bet recognized')
ok(text(azuro.rows).includes('10 USDT') && text(azuro.rows).includes('1.85'), 'Azuro stake + min odds decode')

const clobAuth = decodeTyped({
  primaryType: 'ClobAuth',
  domain: { name: 'ClobAuthDomain', version: '1', chainId: 137 },
  types: {},
  message: { address: '0x' + '11'.repeat(20), timestamp: '1700000000', nonce: 0, message: 'This message attests...' },
})
ok(clobAuth.title === 'Polymarket API access', 'ClobAuth recognized')

const mystery = decodeTyped({
  primaryType: 'Sneaky',
  domain: { name: 'Unknown Venue', version: '9', chainId: 1 },
  types: {},
  message: { a: 1 },
})
ok(/Unknown Venue/.test(mystery.title) && /doesn’t recognize/.test(mystery.warning), 'unknown typed data falls back with warning')

console.log(`decode: ${n} assertions passed`)
