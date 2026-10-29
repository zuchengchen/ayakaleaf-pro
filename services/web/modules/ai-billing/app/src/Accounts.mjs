import mongoose from '../../../../app/src/infrastructure/Mongoose.mjs'
import { ObjectId } from '../../../../app/src/infrastructure/mongodb.mjs'
import { AiAccount, AiLedgerEntry } from '../models/AiBilling.mjs'

/**
 * Users' balances (integers, millionths of a yuan) and VIP membership, and
 * the ledger of every use and change. Balances only change through $inc,
 * so concurrent charges and credits add up.
 */

const DAY_MS = 24 * 3600 * 1000
export const LEDGER_PAGE = 50

function id(value) {
  return value instanceof ObjectId ? value : new ObjectId(String(value))
}

function accounts() {
  return AiAccount.collection
}

function ledger() {
  return AiLedgerEntry.collection
}

function view(doc) {
  return { balance: doc?.balance ?? 0, vipUntil: doc?.vipUntil ?? null }
}

export function isVip(account, at = new Date()) {
  return Boolean(account.vipUntil && account.vipUntil > at)
}

export async function getAccount(userId) {
  return view(await accounts().findOne({ userId: id(userId) }))
}

async function addLedger(entry, session) {
  await ledger().insertOne(
    { ...entry, userId: id(entry.userId), createdAt: entry.createdAt || new Date() },
    { session }
  )
}

/** Adds to a balance (negative to charge) and returns the account after. */
async function incBalance(userId, amount, session) {
  const now = new Date()
  const doc = await accounts().findOneAndUpdate(
    { userId: id(userId) },
    {
      $inc: { balance: amount },
      $set: { updatedAt: now },
      $setOnInsert: { vipUntil: null, createdAt: now },
    },
    { upsert: true, returnDocument: 'after', session }
  )
  return view(doc)
}

/** Records a use; a charge (micro > 0) comes off the balance. */
export async function recordUsage(entry) {
  const { micro, ...rest } = entry
  const amount = micro > 0 ? -micro : 0
  if (amount < 0) await incBalance(entry.userId, amount)
  await addLedger({ ...rest, type: 'usage', amount })
}

/** Adds membership days after the current end, or after now if none. */
async function extendVip(userId, days, session) {
  const now = new Date()
  const doc = await accounts().findOneAndUpdate(
    { userId: id(userId) },
    [
      {
        $set: {
          vipUntil: {
            $add: [{ $max: [{ $ifNull: ['$vipUntil', now] }, now] }, days * DAY_MS],
          },
          balance: { $ifNull: ['$balance', 0] },
          createdAt: { $ifNull: ['$createdAt', now] },
          updatedAt: now,
        },
      },
    ],
    { upsert: true, returnDocument: 'after', session }
  )
  return view(doc)
}

/** Runs work in a Mongo transaction, so a code is never used without its credit. */
export async function withTransaction(work) {
  const session = mongoose.connection.client.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await work(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}

/** Credits a redeemed code to a user, in the caller's transaction. */
export async function applyCode(userId, code, session) {
  if (code.kind === 'vip_days') {
    const account = await extendVip(userId, code.value, session)
    await addLedger(
      { userId, type: 'redeem', amount: 0, vipDays: code.value, vipUntil: account.vipUntil, codeId: code._id },
      session
    )
    return account
  }
  const account = await incBalance(userId, code.value, session)
  await addLedger({ userId, type: 'redeem', amount: code.value, codeId: code._id }, session)
  return account
}

/**
 * An admin's change to a user: add to the balance (negative takes away),
 * add membership days, or set when membership ends (null ends it now).
 */
export async function adjust(adminId, userId, { balance = 0, vipDays = 0, vipUntil, note = '' }) {
  return await withTransaction(async session => {
    let account = await getAccount(userId)
    if (balance) {
      account = await incBalance(userId, balance, session)
    }
    if (vipDays) {
      account = await extendVip(userId, vipDays, session)
    }
    if (vipUntil !== undefined) {
      const doc = await accounts().findOneAndUpdate(
        { userId: id(userId) },
        {
          $set: { vipUntil, updatedAt: new Date() },
          $setOnInsert: { balance: 0, createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after', session }
      )
      account = view(doc)
    }
    await addLedger(
      {
        userId,
        type: 'adjust',
        amount: balance,
        ...(vipDays && { vipDays }),
        ...((vipDays || vipUntil !== undefined) && { vipUntil: account.vipUntil }),
        adminId: id(adminId),
        note,
      },
      session
    )
    return account
  })
}

/** A page of a user's ledger, newest first, older than `before` if given. */
export async function listLedger(userId, { before = null, limit = LEDGER_PAGE } = {}) {
  const query = { userId: id(userId) }
  if (before) query.createdAt = { $lt: before }
  return await ledger()
    .find(query, { projection: { userId: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
}

export default {
  LEDGER_PAGE,
  isVip,
  getAccount,
  recordUsage,
  withTransaction,
  applyCode,
  adjust,
  listLedger,
}
