import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import UserGetter from '../../../../app/src/Features/User/UserGetter.mjs'
import { ObjectId } from '../../../../app/src/infrastructure/mongodb.mjs'
import BillingStore, { BillingValidationError } from './BillingStore.mjs'
import Accounts from './Accounts.mjs'
import RedeemCodes from './RedeemCodes.mjs'
import { ledgerView } from './AiBillingController.mjs'

const __dirname = Path.dirname(fileURLToPath(import.meta.url))

// Balances are entered in yuan and kept in millionths of a yuan
const MICRO = 1000000
const MAX_YUAN = 1000000
const MAX_DAYS = 36500
const USER_FIELDS = { email: 1, first_name: 1, last_name: 1 }

function adminIdOf(req) {
  return SessionManager.getLoggedInUserId(req.session)
}

function badRequest(res, message) {
  return res.status(400).json({ message })
}

async function page(req, res) {
  res.render(Path.resolve(__dirname, '../views/admin-ai-billing'), { title: 'ai_billing' })
}

async function getSettings(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await BillingStore.getAdminView())
}

async function saveSettings(req, res) {
  try {
    await BillingStore.save(req.body)
  } catch (err) {
    if (err instanceof BillingValidationError) return badRequest(res, err.message)
    throw err
  }
  logger.info({ userId: adminIdOf(req), enabled: req.body?.enabled === true }, 'ai billing settings saved')
  res.json(await BillingStore.getAdminView())
}

function batchView(batch) {
  return {
    id: String(batch._id),
    kind: batch.kind,
    value: batch.value,
    count: batch.count,
    expiresAt: batch.expiresAt,
    note: batch.note,
    createdAt: batch.createdAt,
    unused: batch.unused,
    used: batch.used,
    void: batch.void,
  }
}

async function listBatches(req, res) {
  res.set('Cache-Control', 'no-store')
  const batches = await RedeemCodes.listBatches()
  res.json({ batches: batches.map(batchView) })
}

/**
 * Generates codes and returns them once, with a redeem link for each: the
 * links are what goes to the shop as card secrets.
 */
async function generateBatch(req, res) {
  const { kind, amount, count, expiresInDays, note } = req.body || {}
  if (!['vip_days', 'balance'].includes(kind)) return badRequest(res, 'Choose VIP days or balance')
  const number = Number(amount)
  let value
  if (kind === 'vip_days') {
    if (!Number.isInteger(number) || number < 1 || number > MAX_DAYS) {
      return badRequest(res, `Days must be a whole number from 1 to ${MAX_DAYS}`)
    }
    value = number
  } else {
    if (!Number.isFinite(number) || number <= 0 || number > MAX_YUAN) {
      return badRequest(res, `The amount must be more than 0 and at most ${MAX_YUAN} yuan`)
    }
    value = Math.round(number * MICRO)
  }
  const how = Number(count)
  if (!Number.isInteger(how) || how < 1 || how > RedeemCodes.MAX_BATCH) {
    return badRequest(res, `The number of codes must be from 1 to ${RedeemCodes.MAX_BATCH}`)
  }
  let expires = null
  if (expiresInDays != null && expiresInDays !== '') {
    expires = Number(expiresInDays)
    if (!Number.isInteger(expires) || expires < 1 || expires > MAX_DAYS) {
      return badRequest(res, `Expiry must be a whole number of days from 1 to ${MAX_DAYS}`)
    }
  }
  if (note != null && (typeof note !== 'string' || note.length > 200)) {
    return badRequest(res, 'The note is too long')
  }
  const { batch, codes } = await RedeemCodes.generateBatch({
    kind,
    value,
    count: how,
    expiresInDays: expires,
    note: note?.trim() || '',
    createdBy: adminIdOf(req),
  })
  logger.info({ userId: adminIdOf(req), batchId: batch._id, kind, value, count: how }, 'ai billing: codes generated')
  const base = Settings.siteUrl.replace(/\/+$/, '')
  res.json({
    batch: batchView({ ...batch, unused: how, used: 0, void: 0 }),
    codes,
    links: codes.map(code => `${base}/ai/redeem?code=${code}`),
  })
}

async function voidBatch(req, res) {
  if (!ObjectId.isValid(req.params.batchId)) return res.sendStatus(404)
  const voided = await RedeemCodes.voidBatch(req.params.batchId)
  logger.info({ userId: adminIdOf(req), batchId: req.params.batchId, voided }, 'ai billing: codes voided')
  res.json({ voided })
}

function userView(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
  }
}

async function accountOf(userId) {
  const [account, entries] = await Promise.all([
    Accounts.getAccount(userId),
    Accounts.listLedger(userId),
  ])
  return {
    balance: account.balance,
    vipUntil: account.vipUntil,
    ledger: entries.map(ledgerView),
    more: entries.length === Accounts.LEDGER_PAGE,
  }
}

async function findUser(req, res) {
  res.set('Cache-Control', 'no-store')
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : ''
  if (!email) return badRequest(res, 'Enter an email address')
  const user = await UserGetter.promises.getUserByAnyEmail(email, USER_FIELDS)
  if (!user) return res.status(404).json({ message: 'No user has that email address' })
  res.json({ user: userView(user), ...(await accountOf(user._id)) })
}

async function userLedger(req, res) {
  res.set('Cache-Control', 'no-store')
  if (!ObjectId.isValid(req.params.userId)) return res.sendStatus(404)
  const before = req.query.before ? new Date(String(req.query.before)) : null
  const entries = await Accounts.listLedger(req.params.userId, {
    before: before && !Number.isNaN(before.getTime()) ? before : null,
  })
  res.json({ entries: entries.map(ledgerView), more: entries.length === Accounts.LEDGER_PAGE })
}

/**
 * Changes a user's account: balanceYuan adds (or with a minus, takes away),
 * vipDays adds membership, vipUntil sets its end (null ends it).
 */
async function adjustUser(req, res) {
  const { userId } = req.params
  if (!ObjectId.isValid(userId)) return res.sendStatus(404)
  const user = await UserGetter.promises.getUser(userId, USER_FIELDS)
  if (!user) return res.sendStatus(404)
  const { balanceYuan, vipDays, vipUntil, note } = req.body || {}
  const change = {}
  if (balanceYuan != null && balanceYuan !== '') {
    const yuan = Number(balanceYuan)
    if (!Number.isFinite(yuan) || Math.abs(yuan) > MAX_YUAN || yuan === 0) {
      return badRequest(res, `The balance change must be a non-zero amount up to ${MAX_YUAN} yuan`)
    }
    change.balance = Math.round(yuan * MICRO)
  }
  if (vipDays != null && vipDays !== '') {
    const days = Number(vipDays)
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return badRequest(res, `VIP days must be a whole number from 1 to ${MAX_DAYS}`)
    }
    change.vipDays = days
  }
  if (vipUntil !== undefined) {
    if (vipUntil === null) {
      change.vipUntil = null
    } else {
      const until = new Date(String(vipUntil))
      if (Number.isNaN(until.getTime())) return badRequest(res, 'The VIP end is not a date')
      change.vipUntil = until
    }
  }
  if (!Object.keys(change).length) return badRequest(res, 'Nothing to change')
  if (note != null && (typeof note !== 'string' || note.length > 200)) {
    return badRequest(res, 'The note is too long')
  }
  await Accounts.adjust(adminIdOf(req), userId, { ...change, note: note?.trim() || '' })
  logger.info({ adminId: adminIdOf(req), userId, change }, 'ai billing: account adjusted')
  res.json({ user: userView(user), ...(await accountOf(userId)) })
}

export default {
  page: expressify(page),
  getSettings: expressify(getSettings),
  saveSettings: expressify(saveSettings),
  listBatches: expressify(listBatches),
  generateBatch: expressify(generateBatch),
  voidBatch: expressify(voidBatch),
  findUser: expressify(findUser),
  userLedger: expressify(userLedger),
  adjustUser: expressify(adjustUser),
}
