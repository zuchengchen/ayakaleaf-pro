/**
 * Official list prices, for filling in a model's price on the admin page.
 * Read from the vendors' pricing pages on FETCHED_AT; vendors change them,
 * so an admin should check them now and then. Qwen, Kimi and GLM publish
 * their prices on pages that need a browser, and are left to the admin.
 *
 * Rates are per million tokens: input, cached input (cache hits), output and
 * cache writes where the vendor charges them.
 */

export const FETCHED_AT = '2026-10-29'

const SOURCES = {
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  openai: 'https://developers.openai.com/api/docs/pricing',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
}

function rates(input, cachedInput, output, cacheWrite = null) {
  return { input, cachedInput, cacheWrite, output }
}

function tier(above, base, offPeak = null) {
  return { above, rates: base, offPeak }
}

function price(currency, schedules, peak = null) {
  return { currency, peak, schedules }
}

/** One set of rates for every call. */
function flat(currency, base) {
  return price(currency, [{ from: null, tiers: [tier(0, base)] }])
}

/** Higher rates for calls with more input tokens than `above`. */
function longContext(currency, above, base, long) {
  return price(currency, [{ from: null, tiers: [tier(0, base), tier(above, long)] }])
}

/** Rates that change on a Beijing date. */
function dated(currency, base, from, later) {
  return price(currency, [
    { from: null, tiers: [tier(0, base)] },
    { from, tiers: [tier(0, later)] },
  ])
}

// Weekdays 9:00-12:00 and 14:00-18:00 Beijing time; the rest of the time,
// and statutory holidays, cost half
const DEEPSEEK_PEAK = {
  weekdays: [1, 2, 3, 4, 5],
  ranges: [
    { from: '09:00', to: '12:00' },
    { from: '14:00', to: '18:00' },
  ],
}

function deepseek(peakRates, offPeakRates) {
  return price('CNY', [{ from: null, tiers: [tier(0, peakRates, offPeakRates)] }], DEEPSEEK_PEAK)
}

// OpenAI's flagship models cost more above 272K input tokens
const OPENAI_LONG = 272000
// Gemini Pro models cost more above 200K prompt tokens
const GEMINI_LONG = 200000

export const PRESETS = [
  {
    vendor: 'deepseek',
    ids: ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'],
    price: deepseek(rates(2, 0.04, 8), rates(1, 0.02, 4)),
  },
  {
    vendor: 'deepseek',
    ids: ['deepseek-v4-pro'],
    price: deepseek(rates(9, 0.3, 27), rates(4.5, 0.15, 13.5)),
  },

  { vendor: 'openai', ids: ['gpt-6-astra'], price: longContext('USD', OPENAI_LONG, rates(10, 1, 50), rates(20, 2, 75)) },
  { vendor: 'openai', ids: ['gpt-6.1-sol'], price: longContext('USD', OPENAI_LONG, rates(2, 0.1, 10), rates(4, 0.2, 15)) },
  { vendor: 'openai', ids: ['gpt-6.1-terra'], price: longContext('USD', OPENAI_LONG, rates(1, 0.05, 5), rates(2, 0.1, 7.5)) },
  { vendor: 'openai', ids: ['gpt-6-sol'], price: longContext('USD', OPENAI_LONG, rates(2, 0.2, 10), rates(4, 0.4, 15)) },
  { vendor: 'openai', ids: ['gpt-6-luna'], price: longContext('USD', OPENAI_LONG, rates(0.1, 0.01, 0.5), rates(0.2, 0.02, 0.75)) },
  // Promotional price, "at least through November 21, 2026"
  { vendor: 'openai', ids: ['gpt-5.6-sol'], price: longContext('USD', OPENAI_LONG, rates(4, 0.4, 20), rates(8, 0.8, 30)) },
  { vendor: 'openai', ids: ['gpt-5.6-terra'], price: longContext('USD', OPENAI_LONG, rates(2, 0.2, 12), rates(4, 0.4, 18)) },
  { vendor: 'openai', ids: ['gpt-5.6-luna'], price: longContext('USD', OPENAI_LONG, rates(0.2, 0.02, 1.2), rates(0.4, 0.04, 1.8)) },
  { vendor: 'openai', ids: ['gpt-5.5'], price: longContext('USD', OPENAI_LONG, rates(5, 0.5, 30), rates(10, 1, 45)) },
  { vendor: 'openai', ids: ['gpt-5.5-pro', 'gpt-5.4-pro'], price: longContext('USD', OPENAI_LONG, rates(30, null, 180), rates(60, null, 270)) },
  { vendor: 'openai', ids: ['gpt-5.4'], price: longContext('USD', OPENAI_LONG, rates(2.5, 0.25, 15), rates(5, 0.5, 22.5)) },
  { vendor: 'openai', ids: ['gpt-5.4-mini'], price: flat('USD', rates(0.75, 0.075, 4.5)) },
  { vendor: 'openai', ids: ['gpt-5.4-nano'], price: flat('USD', rates(0.2, 0.02, 1.25)) },
  { vendor: 'openai', ids: ['gpt-5.2'], price: flat('USD', rates(1.75, 0.175, 14)) },
  { vendor: 'openai', ids: ['gpt-5.1', 'gpt-5'], price: flat('USD', rates(1.25, 0.125, 10)) },
  { vendor: 'openai', ids: ['gpt-5-mini'], price: flat('USD', rates(0.25, 0.025, 2)) },
  { vendor: 'openai', ids: ['gpt-5-nano'], price: flat('USD', rates(0.05, 0.005, 0.4)) },
  { vendor: 'openai', ids: ['gpt-4.1', 'o3'], price: flat('USD', rates(2, 0.5, 8)) },
  { vendor: 'openai', ids: ['gpt-4.1-mini'], price: flat('USD', rates(0.4, 0.1, 1.6)) },
  { vendor: 'openai', ids: ['gpt-4.1-nano'], price: flat('USD', rates(0.1, 0.025, 0.4)) },
  { vendor: 'openai', ids: ['gpt-4o'], price: flat('USD', rates(2.5, 1.25, 10)) },
  { vendor: 'openai', ids: ['gpt-4o-mini'], price: flat('USD', rates(0.15, 0.075, 0.6)) },
  { vendor: 'openai', ids: ['o4-mini'], price: flat('USD', rates(1.1, 0.275, 4.4)) },

  // Cache writes are the 5-minute ones
  { vendor: 'anthropic', ids: ['claude-fable-5-1'], price: flat('USD', rates(10, 0.25, 50, 12.5)) },
  { vendor: 'anthropic', ids: ['claude-opus-5-5'], price: flat('USD', rates(4, 0.2, 20, 5)) },
  {
    vendor: 'anthropic',
    ids: ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5'],
    price: flat('USD', rates(5, 0.5, 25, 6.25)),
  },
  { vendor: 'anthropic', ids: ['claude-opus-4-1'], price: flat('USD', rates(15, 1.5, 75, 18.75)) },
  { vendor: 'anthropic', ids: ['claude-sonnet-5-5'], price: flat('USD', rates(2, 0.1, 10, 2.5)) },
  { vendor: 'anthropic', ids: ['claude-sonnet-5'], price: flat('USD', rates(2, 0.2, 10, 2.5)) },
  { vendor: 'anthropic', ids: ['claude-sonnet-4-6', 'claude-sonnet-4-5'], price: flat('USD', rates(3, 0.3, 15, 3.75)) },
  {
    vendor: 'anthropic',
    ids: ['claude-haiku-5-5'],
    price: longContext('USD', 100000, rates(0.1, 0.01, 0.5, 0.125), rates(0.5, 0.05, 2.5, 0.625)),
  },
  { vendor: 'anthropic', ids: ['claude-haiku-4-5'], price: flat('USD', rates(1, 0.1, 5, 1.25)) },

  // "through November 30, 2026", then "starting December 1, 2026"
  { vendor: 'google', ids: ['gemini-4-argon'], price: dated('USD', rates(2, 0.1, 10), '2026-12-01', rates(4, 0.2, 20)) },
  {
    vendor: 'google',
    ids: ['gemini-3.8-flash', 'gemini-3.6-flash'],
    price: dated('USD', rates(0.75, 0.075, 3.75), '2027-01-01', rates(1.5, 0.15, 7.5)),
  },
  { vendor: 'google', ids: ['gemini-3.5-flash-lite', 'gemini-2.5-flash'], price: flat('USD', rates(0.3, 0.03, 2.5)) },
  { vendor: 'google', ids: ['gemini-3.1-flash-lite'], price: flat('USD', rates(0.25, 0.025, 1.5)) },
  {
    vendor: 'google',
    ids: ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools'],
    price: longContext('USD', GEMINI_LONG, rates(2, 0.2, 12), rates(4, 0.4, 18)),
  },
  { vendor: 'google', ids: ['gemini-3-flash-preview'], price: flat('USD', rates(0.5, 0.05, 3)) },
  { vendor: 'google', ids: ['gemini-2.5-pro'], price: longContext('USD', GEMINI_LONG, rates(1.25, 0.125, 10), rates(2.5, 0.25, 15)) },
  { vendor: 'google', ids: ['gemini-2.5-flash-lite'], price: flat('USD', rates(0.1, 0.01, 0.4)) },
]

/**
 * The name a gateway gives a model, without a vendor prefix such as
 * "deepseek/" or "models/" and without a date suffix such as "-20251001".
 */
export function baseModelName(model) {
  return String(model || '')
    .trim()
    .toLowerCase()
    .split('/')
    .pop()
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, '')
}

/** The official price for a model name, or null. */
export function findPreset(model) {
  const name = baseModelName(model)
  const preset = PRESETS.find(entry => entry.ids.includes(name))
  if (!preset) return null
  return {
    vendor: preset.vendor,
    source: SOURCES[preset.vendor],
    fetchedAt: FETCHED_AT,
    price: structuredClone(preset.price),
  }
}

export default { FETCHED_AT, PRESETS, baseModelName, findPreset }
