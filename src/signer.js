// All EVM signing happens HERE, in the vault origin. Ported from
// web/src/lib/signer.js (the audited in-dashboard signer this replaces); the
// unlocked key lives only in session.js module memory, never in React state,
// storage, or a message.
//
// WebCrypto has no secp256k1, so the key is unavoidably an extractable JS
// value — the vault's CSP and minimal surface are the defense (PROTOCOL.md).
import { Wallet, Signature } from 'ethers'
import { decryptSecret } from './crypto.js'

export function generateWallet() {
  const w = Wallet.createRandom()
  return { wallet: new Wallet(w.privateKey), privateKey: w.privateKey }
}

export function importWallet(privateKey) {
  return new Wallet(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey)
}

export async function unlockWallet(blob, password) {
  const pk = await decryptSecret(blob, password)
  const w = new Wallet(pk)
  if (blob.address && w.address.toLowerCase() !== blob.address.toLowerCase())
    throw new Error('decrypted key does not match wallet address')
  return w
}

// typed_data: full EIP-712 dict {types, domain, message, primaryType}.
// ethers derives EIP712Domain itself, so strip it from types before signing.
export async function signTyped(wallet, typed_data) {
  const { EIP712Domain: _drop, ...types } = typed_data.types
  const flat = await wallet.signTypedData(typed_data.domain, types, typed_data.message)
  const sig = Signature.from(flat)
  return { r: sig.r, s: sig.s, v: sig.v, flat }
}

// unsigned_tx: {to,data,value,nonce,gas,maxFeePerGas,maxPriorityFeePerGas,chainId}
export async function signTx(wallet, tx) {
  return wallet.signTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value ?? 0),
    nonce: tx.nonce,
    gasLimit: BigInt(tx.gas),
    maxFeePerGas: BigInt(tx.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas ?? 0),
    chainId: tx.chainId,
    type: 2,
  })
}

// personal_sign (EIP-191) — used once per venue for ownership proofs.
export const signMessage = (wallet, message) => wallet.signMessage(message)
