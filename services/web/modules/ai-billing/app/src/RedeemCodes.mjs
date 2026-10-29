import crypto from 'node:crypto'
import OError from '@overleaf/o-error'
import { ObjectId } from '../../../../app/src/infrastructure/mongodb.mjs'
import { AiRedeemBatch, AiRedeemCode } from '../models/AiBilling.mjs'
import Accounts from './Accounts.mjs'

/**
 * Redeem codes: 16 Crockford base32 characters (80 random bits) shown as
 * XXXX-XXXX-XXXX-XXXX. Only their SHA-256 is stored, so the codes are seen
 * once, when generated. Redeeming one marks it used and credits it in one
 * transaction.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 16
export const MAX_BATCH = 1000
const DAY_MS = 24 * 3600 * 1000

export class RedeemError extends OError {
  /** @param {'invalid'|'not_found'|'used'|'void'|'expired'} reason */
  constructor(reason) {
    super(`redeem code ${reason}`, { reason })
    this.reason = reason
  }
}

/** The 16 characters of a code as typed, or null if it cannot be one. */
export function normalizeCode(input) {
  if (typeof input !== 'string' || input.length > 100) return null
  const code = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  if (code.length !== CODE_LENGTH || [...code].some(char => !ALPHABET.includes(char))) return null
  return code
}

export function formatCode(code) {
  return code.match(/.{4}/g).join('-')
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export function newCode() {
  const bytes = crypto.randomBytes(10)
  let bits = 0
  let value = 0
  let code = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      code += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return code
}

/**
 * Generates a batch: kind 'vip_days' with value days, or 'balance' with
 * value millionths of a yuan. Returns the batch and its formatted codes.
 */
export async function generateBatch({ kind, value, count, expiresInDays = null, note = '', createdBy }) {
  const now = new Date()
  const expiresAt = expiresInDays ? new Date(now.getTime() + expiresInDays * DAY_MS) : null
  const batch = await AiRedeemBatch.create({
    kind,
    value,
    count,
    expiresAt,
    note,
    createdBy: createdBy ? new ObjectId(String(createdBy)) : undefined,
    createdAt: now,
  })
  const codes = Array.from({ length: count }, newCode)
  await AiRedeemCode.collection.insertMany(
    codes.map(code => ({
      hash: hashCode(code),
      batchId: batch._id,
      kind,
      value,
      expiresAt,
      status: 'unused',
      usedBy: null,
      usedAt: null,
      createdAt: now,
    }))
  )
  return { batch: batch.toObject(), codes: codes.map(formatCode) }
}

/**
 * Redeems a code for a user: { kind, value, account }. Throws a RedeemError
 * when the code does not exist, was used, was voided or has expired.
 */
export async function redeem(userId, input) {
  const code = normalizeCode(input)
  if (!code) throw new RedeemError('invalid')
  const hash = hashCode(code)
  return await Accounts.withTransaction(async session => {
    const now = new Date()
    const claimed = await AiRedeemCode.collection.findOneAndUpdate(
      {
        hash,
        status: 'unused',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { $set: { status: 'used', usedBy: new ObjectId(String(userId)), usedAt: now } },
      { returnDocument: 'after', session }
    )
    if (!claimed) {
      const found = await AiRedeemCode.collection.findOne({ hash }, { session })
      if (!found) throw new RedeemError('not_found')
      if (found.status === 'used') throw new RedeemError('used')
      if (found.status === 'void') throw new RedeemError('void')
      throw new RedeemError('expired')
    }
    const account = await Accounts.applyCode(userId, claimed, session)
    return { kind: claimed.kind, value: claimed.value, account }
  })
}

/** Voids the unused codes of a batch; returns how many. */
export async function voidBatch(batchId) {
  const result = await AiRedeemCode.collection.updateMany(
    { batchId: new ObjectId(String(batchId)), status: 'unused' },
    { $set: { status: 'void' } }
  )
  return result.modifiedCount
}

/** The newest batches with how many of their codes are unused, used and void. */
export async function listBatches({ limit = 100 } = {}) {
  const batches = await AiRedeemBatch.find({}).sort({ createdAt: -1 }).limit(limit).lean().exec()
  const counts = await AiRedeemCode.collection
    .aggregate([
      { $match: { batchId: { $in: batches.map(batch => batch._id) } } },
      { $group: { _id: { batchId: '$batchId', status: '$status' }, n: { $sum: 1 } } },
    ])
    .toArray()
  return batches.map(batch => {
    const of = status =>
      counts.find(c => c._id.batchId.equals(batch._id) && c._id.status === status)?.n ?? 0
    return { ...batch, unused: of('unused'), used: of('used'), void: of('void') }
  })
}

export default {
  MAX_BATCH,
  RedeemError,
  normalizeCode,
  formatCode,
  hashCode,
  newCode,
  generateBatch,
  redeem,
  voidBatch,
  listBatches,
}
