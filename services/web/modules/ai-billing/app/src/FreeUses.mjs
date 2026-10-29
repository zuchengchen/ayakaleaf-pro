import RedisWrapper from '../../../../app/src/infrastructure/RedisWrapper.mjs'
import { beijingDate } from './BeijingTime.mjs'

/**
 * Counts each user's free uses per Beijing day in Redis; the date in the key
 * resets them at midnight and old counters expire. Also remembers, for a
 * while, which user messages were free, so the requests that carry on a
 * reply after the browser ran a tool stay free too.
 */

const COUNTER_TTL_SECONDS = 2 * 24 * 3600
const TURN_TTL_SECONDS = 6 * 3600

let _rclient

function rclient() {
  _rclient ??= RedisWrapper.client('aiBilling')
  return _rclient
}

function counterKey(userId, date) {
  return `ai-billing:free:${userId}:${date}`
}

function turnKey(userId, turn) {
  return `ai-billing:turn:${userId}:${turn}`
}

/** Free uses taken today. */
export async function usedToday(userId, at = new Date()) {
  const value = await rclient().get(counterKey(userId, beijingDate(at)))
  return Math.max(0, parseInt(value || '0', 10) || 0)
}

/**
 * Takes one of today's free uses; returns the Beijing date it was taken on,
 * or null when none is left.
 */
export async function take(userId, limit, at = new Date()) {
  if (!(limit > 0)) return null
  const date = beijingDate(at)
  const key = counterKey(userId, date)
  // The wrapper unwraps the results, and throws if a command failed
  const [count] = await rclient().multi().incr(key).expire(key, COUNTER_TTL_SECONDS).exec()
  if (count > limit) {
    await rclient().decr(key)
    return null
  }
  return date
}

/** Gives back a free use taken on a date, for a call that produced nothing. */
export async function giveBack(userId, date) {
  const key = counterKey(userId, date)
  const count = await rclient().decr(key)
  if (count < 0) await rclient().incr(key)
}

/** Remembers how a user message is paid for: 'free' or 'paid'. */
export async function markTurn(userId, turn, mode) {
  if (!turn) return
  await rclient().set(turnKey(userId, turn), mode, 'EX', TURN_TTL_SECONDS)
}

export async function turnMode(userId, turn) {
  if (!turn) return null
  return await rclient().get(turnKey(userId, turn))
}

export default { usedToday, take, giveBack, markTurn, turnMode }
