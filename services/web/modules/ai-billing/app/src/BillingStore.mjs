import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'
import AiProviderStore from '../../../ai-providers/app/src/AiProviderStore.mjs'
import { AiBillingSettings, BILLING_TYPES } from '../models/AiBilling.mjs'
import { PriceValidationError, validatePrice } from './Pricing.mjs'
import { findPreset } from './PriceCatalog.mjs'

/**
 * The billing settings and model prices an admin saved, as an in-memory
 * snapshot that is reloaded after a save here and at most REFRESH_MS later
 * in other web processes. Until an admin saves them billing is off.
 */

const REFRESH_MS = 15 * 1000
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_OFF_PEAK_DATES = 400

export class BillingValidationError extends OError {}

export const DEFAULTS = Object.freeze({
  enabled: false,
  freeDailyUses: 20,
  markup: 1,
  usdToCny: 7.2,
  offPeakDates: [],
  shopUrl: '',
  models: [],
})

let _snapshot = null
let _loadedAt = 0
let _loading = null

function fromDocument(doc) {
  if (!doc) return { ...DEFAULTS, models: new Map(), updatedAt: null }
  return {
    enabled: Boolean(doc.enabled),
    freeDailyUses: doc.freeDailyUses ?? DEFAULTS.freeDailyUses,
    markup: doc.markup ?? DEFAULTS.markup,
    usdToCny: doc.usdToCny ?? DEFAULTS.usdToCny,
    offPeakDates: doc.offPeakDates || [],
    shopUrl: doc.shopUrl || '',
    models: new Map(
      (doc.models || []).map(entry => [entry.modelId, { billing: entry.billing, price: entry.price || null }])
    ),
    updatedAt: doc.updatedAt || null,
  }
}

async function load() {
  const doc = await AiBillingSettings.findOne({}).lean().exec()
  _snapshot = fromDocument(doc)
  _loadedAt = Date.now()
}

/** Reloads the settings; concurrent callers share one load. */
export async function refresh() {
  _loading ??= load().finally(() => {
    _loading = null
  })
  return await _loading
}

/** Waits for settings no older than REFRESH_MS. */
export async function ensureFresh() {
  if (Date.now() - _loadedAt > REFRESH_MS) {
    try {
      await refresh()
    } catch (err) {
      // Keep the last settings while Mongo is unavailable
      logger.err({ err }, 'ai billing: could not load settings')
    }
  }
}

/** The settings in effect, without waiting; reloads in the background when stale. */
export function current() {
  if (Date.now() - _loadedAt > REFRESH_MS && !_loading) {
    ensureFresh().catch(() => {})
  }
  return _snapshot || fromDocument(null)
}

/** How a model is paid for: { billing, price }, with billing null if unset. */
export function modelBilling(modelId) {
  return current().models.get(modelId) || { billing: null, price: null }
}

function fail(message) {
  throw new BillingValidationError(message)
}

function number(value, field, { min, max, integer = false }) {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (
    typeof parsed !== 'number' ||
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max ||
    (integer && !Number.isInteger(parsed))
  ) {
    fail(`${field} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}`)
  }
  return parsed
}

function shopUrl(value) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string' || value.length > 500) fail('The shop link is invalid')
  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    fail('The shop link is not a valid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail('The shop link must start with http:// or https://')
  return value.trim()
}

function offPeakDates(value) {
  if (value == null) return []
  if (!Array.isArray(value)) fail('Off-peak dates must be a list')
  const dates = [...new Set(value.map(date => String(date).trim()).filter(Boolean))].sort()
  if (dates.length > MAX_OFF_PEAK_DATES) fail('There are too many off-peak dates')
  for (const date of dates) {
    if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      fail(`"${date}" is not a YYYY-MM-DD date`)
    }
  }
  return dates
}

function models(value) {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > 500) fail('Invalid list of model prices')
  const seen = new Set()
  return value.map(entry => {
    if (typeof entry?.modelId !== 'string' || !ID_PATTERN.test(entry.modelId)) fail('A model has an invalid id')
    if (seen.has(entry.modelId)) fail('A model is listed twice')
    seen.add(entry.modelId)
    if (!BILLING_TYPES.includes(entry.billing)) fail(`Choose how model ${entry.modelId} is paid for`)
    let price = null
    if (entry.price) {
      try {
        price = validatePrice(entry.price)
      } catch (err) {
        if (err instanceof PriceValidationError) fail(`Model ${entry.modelId}: ${err.message}`)
        throw err
      }
    }
    return { modelId: entry.modelId, billing: entry.billing, price }
  })
}

/** Checks the admin's form and turns it into the document to store. */
export function toDocument(input) {
  if (!input || typeof input !== 'object') fail('Invalid settings')
  return {
    enabled: input.enabled === true,
    freeDailyUses: number(input.freeDailyUses, 'Free uses a day', { min: 0, max: 100000, integer: true }),
    markup: number(input.markup, 'The markup', { min: 0.01, max: 100 }),
    usdToCny: number(input.usdToCny, 'The exchange rate', { min: 0.01, max: 1000 }),
    offPeakDates: offPeakDates(input.offPeakDates),
    shopUrl: shopUrl(input.shopUrl),
    models: models(input.models),
    updatedAt: new Date(),
  }
}

export async function save(input) {
  const doc = toDocument(input)
  await AiBillingSettings.findOneAndUpdate({}, doc, { upsert: true }).exec()
  await refresh()
}

/**
 * The settings for the admin page, with every model of the AI providers
 * configuration, its billing and the official price for its name.
 */
export async function getAdminView() {
  await Promise.all([refresh(), AiProviderStore.ensureFresh()])
  const settings = current()
  const providers = AiProviderStore.current().providers
  const known = new Set()
  const rows = []
  for (const provider of providers) {
    for (const model of provider.models) {
      known.add(model.id)
      const saved = settings.models.get(model.id)
      rows.push({
        modelId: model.id,
        model: model.model,
        label: model.label || model.model,
        provider: provider.name,
        billing: saved?.billing ?? null,
        price: saved?.price ?? null,
        preset: findPreset(model.model),
      })
    }
  }
  return {
    enabled: settings.enabled,
    freeDailyUses: settings.freeDailyUses,
    markup: settings.markup,
    usdToCny: settings.usdToCny,
    offPeakDates: settings.offPeakDates,
    shopUrl: settings.shopUrl,
    models: rows,
    // Prices of models no longer on the AI providers page, kept on save
    orphans: [...settings.models]
      .filter(([modelId]) => !known.has(modelId))
      .map(([modelId, entry]) => ({ modelId, ...entry })),
    updatedAt: settings.updatedAt,
  }
}

/** For tests: forget the snapshot. */
export function _reset() {
  _snapshot = null
  _loadedAt = 0
  _loading = null
}

export default {
  DEFAULTS,
  BillingValidationError,
  refresh,
  ensureFresh,
  current,
  modelBilling,
  toDocument,
  save,
  getAdminView,
}
