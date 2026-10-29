import logger from '@overleaf/logger'
import { ObjectId } from '../../../../app/src/infrastructure/mongodb.mjs'
import AiProviderStore from '../../../ai-providers/app/src/AiProviderStore.mjs'
import BillingStore from './BillingStore.mjs'
import Accounts, { isVip } from './Accounts.mjs'
import FreeUses from './FreeUses.mjs'
import { costOf, currentRatesInYuan, normalizeUsage } from './Pricing.mjs'
import { nextBeijingMidnight } from './BeijingTime.mjs'

/**
 * Decides whether a user may call a model and how the call is paid for, and
 * charges it afterwards. The AI endpoints call authorize() before a request
 * and settle() after each model step:
 *
 *   free_quota models: free for VIPs; otherwise each new user message takes
 *     one of the day's free uses, and once they are gone it is charged from
 *     the balance at the model's price
 *   metered models: charged from the balance at the model's price
 *   disabled models, and metered ones without a price: not offered
 *
 * A request needs a positive balance to be charged; the last one may take it
 * a little below zero. With billing off everything is allowed and nothing
 * is recorded.
 */

export const DENIALS = {
  modelUnavailable: { status: 403, error: 'ai_model_unavailable' },
  freeQuotaExhausted: { status: 429, error: 'ai_free_quota_exhausted' },
  balanceInsufficient: { status: 402, error: 'ai_balance_insufficient' },
}

function offered({ billing, price }) {
  return billing === 'free_quota' || (billing === 'metered' && Boolean(price))
}

/** Whether users may pick a model; every model while billing is off. */
export function isModelOffered(modelId) {
  if (!BillingStore.current().enabled) return true
  return offered(BillingStore.modelBilling(modelId))
}

/**
 * Whether a user may make a request to a model now. newTurn is false for the
 * requests that carry on a reply after browser tools ran; turn identifies
 * the user message the reply is for.
 *
 * Returns { ok: true, ticket } or { ok: false, denial }; the ticket goes to
 * settle() and, if the call produced nothing, to refund().
 */
export async function authorize({ userId, modelId, newTurn = true, turn = null }) {
  await BillingStore.ensureFresh()
  const settings = BillingStore.current()
  if (!settings.enabled) return { ok: true, ticket: { mode: 'off', userId } }

  const { billing, price } = BillingStore.modelBilling(modelId)
  if (!offered({ billing, price })) return { ok: false, denial: DENIALS.modelUnavailable }

  const account = await Accounts.getAccount(userId)
  const vip = isVip(account)
  const ticket = { mode: 'paid', userId, modelId, vip, freeDate: null }
  if (billing === 'free_quota') {
    if (vip) return { ok: true, ticket: { ...ticket, mode: 'vip' } }
    if (newTurn) {
      const date = await FreeUses.take(userId, settings.freeDailyUses)
      if (date) {
        await FreeUses.markTurn(userId, turn, 'free')
        return { ok: true, ticket: { ...ticket, mode: 'free', freeDate: date } }
      }
    } else if ((await FreeUses.turnMode(userId, turn)) === 'free') {
      return { ok: true, ticket: { ...ticket, mode: 'free' } }
    }
    if (!price) return { ok: false, denial: DENIALS.freeQuotaExhausted }
  }
  if (!(account.balance > 0)) {
    return {
      ok: false,
      denial: { ...DENIALS.balanceInsufficient, freeExhausted: billing === 'free_quota' },
    }
  }
  if (newTurn) await FreeUses.markTurn(userId, turn, 'paid')
  return { ok: true, ticket }
}

function modelName(modelId) {
  return AiProviderStore.findModel(AiProviderStore.current(), modelId)?.model.model
}

/**
 * Records one model step of a request and charges it. modelId is the model
 * that ran, which for summaries of long chats is not the chat's model.
 */
export async function settle(ticket, usage, { modelId = ticket?.modelId, feature, projectId } = {}) {
  if (!ticket || ticket.mode === 'off' || !usage) return
  const settings = BillingStore.current()
  const { billing, price } = BillingStore.modelBilling(modelId)
  let mode
  let micro = 0
  let priceUsed
  let tokens = normalizeUsage(usage)
  if (billing === 'free_quota' && (ticket.vip || ticket.mode === 'free')) {
    mode = ticket.vip ? 'vip' : 'free'
  } else if (price) {
    const cost = costOf(price, usage, {
      usdToCny: settings.usdToCny,
      markup: settings.markup,
      offPeakDates: settings.offPeakDates,
    })
    mode = 'paid'
    micro = cost.micro
    priceUsed = cost.price
    tokens = cost.tokens
  } else {
    // A model whose price was removed while the request ran
    mode = 'unpriced'
  }
  await Accounts.recordUsage({
    userId: ticket.userId,
    mode,
    feature,
    modelId,
    model: modelName(modelId),
    ...(projectId && ObjectId.isValid(projectId) && { projectId: new ObjectId(String(projectId)) }),
    tokens,
    ...(priceUsed && { price: priceUsed }),
    micro,
  })
}

/** settle() that logs instead of failing the request. */
export async function settleQuietly(ticket, usage, options) {
  try {
    await settle(ticket, usage, options)
  } catch (err) {
    logger.err({ err, userId: ticket?.userId }, 'ai billing: could not record a model step')
  }
}

/** Gives back the free use a request took, when it produced nothing. */
export async function refund(ticket) {
  if (!ticket?.freeDate) return
  const date = ticket.freeDate
  ticket.freeDate = null
  try {
    await FreeUses.giveBack(ticket.userId, date)
  } catch (err) {
    logger.err({ err, userId: ticket.userId }, 'ai billing: could not give back a free use')
  }
}

/**
 * What a user sees: balance, membership, today's free uses and, for each
 * offered model, how it is paid for and its rates now in yuan per million
 * tokens.
 */
export async function getStatus(userId) {
  await Promise.all([BillingStore.ensureFresh(), AiProviderStore.ensureFresh()])
  const settings = BillingStore.current()
  const config = AiProviderStore.current()
  const roles = config.roles
  if (!settings.enabled) return { enabled: false, roles }
  const [account, freeUsed] = await Promise.all([
    Accounts.getAccount(userId),
    FreeUses.usedToday(userId),
  ])
  const models = {}
  for (const provider of config.providers) {
    for (const model of provider.models) {
      const entry = BillingStore.modelBilling(model.id)
      if (!offered(entry)) continue
      models[model.id] = {
        label: model.label || model.model,
        billing: entry.billing,
        rates: entry.price
          ? currentRatesInYuan(entry.price, {
              usdToCny: settings.usdToCny,
              markup: settings.markup,
              offPeakDates: settings.offPeakDates,
            })
          : null,
      }
    }
  }
  return {
    enabled: true,
    shopUrl: settings.shopUrl,
    balance: account.balance,
    vipUntil: account.vipUntil,
    vip: isVip(account),
    free: {
      limit: settings.freeDailyUses,
      used: Math.min(freeUsed, settings.freeDailyUses),
      resetsAt: nextBeijingMidnight(),
    },
    models,
    roles,
  }
}

export default {
  DENIALS,
  isModelOffered,
  authorize,
  settle,
  settleQuietly,
  refund,
  getStatus,
}
