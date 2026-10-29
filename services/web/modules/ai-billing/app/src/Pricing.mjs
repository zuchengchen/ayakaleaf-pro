import OError from '@overleaf/o-error'
import { beijingDayStart, beijingParts, minuteOf } from './BeijingTime.mjs'

/**
 * The price of a model and what one model call costs.
 *
 * A price is a currency, an optional peak-hours rule and schedules of rates:
 *
 *   {
 *     currency: 'CNY' | 'USD',
 *     // Beijing weekdays (0 is Sunday) and times at the peak rate; the rest
 *     // of the week, and the admin's off-peak dates, get the off-peak rates
 *     peak: { weekdays: [1, 2, 3, 4, 5], ranges: [{ from: '09:00', to: '12:00' }] } | null,
 *     // Each schedule applies from its Beijing date, the first one from always
 *     schedules: [{
 *       from: 'YYYY-MM-DD' | null,
 *       // A tier applies to calls with more input tokens than its threshold
 *       tiers: [{ above: 0, rates, offPeak: rates | null }],
 *     }],
 *   }
 *
 * Rates are per million tokens: { input, cachedInput, cacheWrite, output };
 * cachedInput and cacheWrite may be null, which charges those tokens as
 * input. Costs are integers in millionths of a yuan, rounded up.
 */

export const CURRENCIES = ['CNY', 'USD']
const MAX_RATE = 100000
const MAX_SCHEDULES = 12
const MAX_TIERS = 6
const MAX_RANGES = 8
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

export class PriceValidationError extends OError {}

function fail(message) {
  throw new PriceValidationError(message)
}

function rate(value, field, { optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) return null
    fail(`${field} is required`)
  }
  const number = typeof value === 'string' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > MAX_RATE) {
    fail(`${field} must be a price between 0 and ${MAX_RATE}`)
  }
  return number
}

function rates(value, field) {
  if (!value || typeof value !== 'object') fail(`${field} are required`)
  return {
    input: rate(value.input, `${field}: input`),
    cachedInput: rate(value.cachedInput, `${field}: cached input`, { optional: true }),
    cacheWrite: rate(value.cacheWrite, `${field}: cache write`, { optional: true }),
    output: rate(value.output, `${field}: output`),
  }
}

function validDate(value, field) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) fail(`${field} must be a YYYY-MM-DD date`)
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) fail(`${field} is not a date`)
  return value
}

function peakRule(value) {
  if (value == null) return null
  if (typeof value !== 'object') fail('Peak hours are invalid')
  const weekdays = [...new Set(value.weekdays)].map(Number).sort()
  if (weekdays.length === 0 || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    fail('Peak hours need weekdays from 0 (Sunday) to 6 (Saturday)')
  }
  if (!Array.isArray(value.ranges) || value.ranges.length === 0 || value.ranges.length > MAX_RANGES) {
    fail(`Peak hours need 1 to ${MAX_RANGES} time ranges`)
  }
  const ranges = value.ranges.map(range => {
    if (!TIME_PATTERN.test(range?.from ?? '') || !TIME_PATTERN.test(range?.to ?? '')) {
      fail('Peak time ranges must be HH:MM')
    }
    if (minuteOf(range.from) >= minuteOf(range.to)) fail('A peak time range must end after it starts')
    return { from: range.from, to: range.to }
  })
  return { weekdays, ranges }
}

/** Checks a price from the admin page and returns it in the stored form. */
export function validatePrice(input) {
  if (!input || typeof input !== 'object') fail('The price is invalid')
  if (!CURRENCIES.includes(input.currency)) fail('Choose CNY or USD')
  const peak = peakRule(input.peak)
  if (!Array.isArray(input.schedules) || input.schedules.length === 0) {
    fail('A price needs at least one set of rates')
  }
  if (input.schedules.length > MAX_SCHEDULES) fail('A price has too many dated rates')
  const schedules = input.schedules.map((schedule, index) => {
    const label = schedule?.from ? `Rates from ${schedule.from}` : 'Rates'
    const from = index === 0 ? null : validDate(schedule?.from, `Dated rates ${index + 1}`)
    if (!Array.isArray(schedule?.tiers) || schedule.tiers.length === 0) fail(`${label} need at least one tier`)
    if (schedule.tiers.length > MAX_TIERS) fail(`${label} have too many tiers`)
    const tiers = schedule.tiers.map((tier, tierIndex) => {
      const above = tierIndex === 0 ? 0 : Number(tier?.above)
      if (!Number.isSafeInteger(above) || above < 0) fail(`${label}: a tier threshold must be a whole number`)
      const field = above ? `${label} above ${above} input tokens` : label
      return {
        above,
        rates: rates(tier?.rates, field),
        offPeak: peak && tier?.offPeak ? rates(tier.offPeak, `${field}, off-peak`) : null,
      }
    })
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].above <= tiers[i - 1].above) fail(`${label}: tier thresholds must go up`)
    }
    return { from, tiers }
  })
  for (let i = 2; i < schedules.length; i++) {
    if (schedules[i].from <= schedules[i - 1].from) fail('Dated rates must be in date order')
  }
  return { currency: input.currency, peak, schedules }
}

/** Whether a moment is in the peak hours; off-peak dates never are. */
export function isPeak(peak, at, offPeakDates = []) {
  if (!peak) return false
  const { date, weekday, minute } = beijingParts(at)
  if (offPeakDates.includes(date)) return false
  if (!peak.weekdays.includes(weekday)) return false
  return peak.ranges.some(range => minute >= minuteOf(range.from) && minute < minuteOf(range.to))
}

/**
 * The rates for a call at a moment with that many input tokens, and which
 * dated rates, tier and period they are: { rates, from, above, period }.
 */
export function selectRates(price, { at = new Date(), inputTokens = 0, offPeakDates = [] } = {}) {
  let schedule = price.schedules[0]
  for (const candidate of price.schedules.slice(1)) {
    if (beijingDayStart(candidate.from) <= at) schedule = candidate
  }
  let tier = schedule.tiers[0]
  for (const candidate of schedule.tiers.slice(1)) {
    if (inputTokens > candidate.above) tier = candidate
  }
  let period = null
  let chosen = tier.rates
  if (price.peak) {
    period = isPeak(price.peak, at, offPeakDates) ? 'peak' : 'offPeak'
    if (period === 'offPeak' && tier.offPeak) chosen = tier.offPeak
  }
  return { rates: chosen, from: schedule.from, above: tier.above, period }
}

/**
 * The token counts of an AI SDK usage report: input (all of it), the cached
 * part, the part written to the cache, and output.
 */
export function normalizeUsage(usage = {}) {
  const count = value => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)
  const input = count(usage.inputTokens)
  const cacheRead = Math.min(
    input,
    count(usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens)
  )
  const cacheWrite = Math.min(input - cacheRead, count(usage.inputTokenDetails?.cacheWriteTokens))
  return {
    input,
    noCache: input - cacheRead - cacheWrite,
    cacheRead,
    cacheWrite,
    output: count(usage.outputTokens),
  }
}

/** How many yuan one unit of the price's currency is. */
export function yuanPer(currency, usdToCny) {
  return currency === 'USD' ? usdToCny : 1
}

/**
 * The cost of a call in millionths of a yuan, with the rates used:
 * { micro, tokens, price: { from, above, period } }.
 */
export function costOf(price, usage, { at = new Date(), usdToCny, markup = 1, offPeakDates = [] }) {
  const tokens = normalizeUsage(usage)
  const selected = selectRates(price, { at, inputTokens: tokens.input, offPeakDates })
  const { rates: r } = selected
  // Per million tokens in yuan is per token in millionths of a yuan
  const raw =
    (tokens.noCache * r.input +
      tokens.cacheRead * (r.cachedInput ?? r.input) +
      tokens.cacheWrite * (r.cacheWrite ?? r.input) +
      tokens.output * r.output) *
    yuanPer(price.currency, usdToCny) *
    markup
  // Floating point leaves 2.0000000001 for 2
  const micro = raw > 0 ? Math.ceil(raw - 1e-6) : 0
  return {
    micro,
    tokens,
    price: { from: selected.from, above: selected.above, period: selected.period },
  }
}

/**
 * The rates in yuan per million tokens that a short call would pay now, for
 * showing next to the model.
 */
export function currentRatesInYuan(price, { at = new Date(), usdToCny, markup = 1, offPeakDates = [] }) {
  const { rates: r, period } = selectRates(price, { at, inputTokens: 0, offPeakDates })
  const factor = yuanPer(price.currency, usdToCny) * markup
  const yuan = value => (value == null ? null : Math.round(value * factor * 10000) / 10000)
  return {
    input: yuan(r.input),
    cachedInput: yuan(r.cachedInput),
    output: yuan(r.output),
    period,
  }
}

export default {
  CURRENCIES,
  PriceValidationError,
  validatePrice,
  isPeak,
  selectRates,
  normalizeUsage,
  yuanPer,
  costOf,
  currentRatesInYuan,
}
