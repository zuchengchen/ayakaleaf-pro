import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '@overleaf/logger'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import AiBilling from './AiBilling.mjs'
import Accounts from './Accounts.mjs'
import RedeemCodes, { RedeemError } from './RedeemCodes.mjs'

const __dirname = Path.dirname(fileURLToPath(import.meta.url))

function userIdOf(req) {
  return SessionManager.getLoggedInUserId(req.session)
}

function beforeOf(req) {
  const before = req.query.before ? new Date(String(req.query.before)) : null
  return before && !Number.isNaN(before.getTime()) ? before : null
}

/** A ledger entry for the browser. */
export function ledgerView(entry) {
  return {
    id: String(entry._id),
    type: entry.type,
    amount: entry.amount ?? 0,
    mode: entry.mode,
    feature: entry.feature,
    model: entry.model,
    tokens: entry.tokens,
    price: entry.price,
    vipDays: entry.vipDays,
    vipUntil: entry.vipUntil,
    note: entry.note,
    createdAt: entry.createdAt,
  }
}

async function accountPage(req, res) {
  res.render(Path.resolve(__dirname, '../views/ai-account'), { title: 'ai_account' })
}

async function redeemPage(req, res) {
  res.render(Path.resolve(__dirname, '../views/ai-redeem'), { title: 'redeem_code' })
}

async function status(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await AiBilling.getStatus(userIdOf(req)))
}

async function ledger(req, res) {
  res.set('Cache-Control', 'no-store')
  const entries = await Accounts.listLedger(userIdOf(req), { before: beforeOf(req) })
  res.json({ entries: entries.map(ledgerView), more: entries.length === Accounts.LEDGER_PAGE })
}

async function redeem(req, res) {
  const userId = userIdOf(req)
  try {
    const result = await RedeemCodes.redeem(userId, req.body?.code)
    logger.info({ userId, kind: result.kind, value: result.value }, 'ai billing: code redeemed')
    res.json({
      kind: result.kind,
      value: result.value,
      balance: result.account.balance,
      vipUntil: result.account.vipUntil,
    })
  } catch (err) {
    if (err instanceof RedeemError) {
      return res.status(err.reason === 'invalid' ? 400 : 409).json({ error: `code_${err.reason}` })
    }
    throw err
  }
}

export default {
  accountPage: expressify(accountPage),
  redeemPage: expressify(redeemPage),
  status: expressify(status),
  ledger: expressify(ledger),
  redeem: expressify(redeem),
}
