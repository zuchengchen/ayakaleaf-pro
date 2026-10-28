import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'
import AccessTokenEncryptor from '@overleaf/access-token-encryptor'
import { AiProviderSettings } from '../models/AiProviderSettings.mjs'

/**
 * The AI gateways, models and model uses an admin configured, kept in Mongo
 * with encrypted API keys. Until an admin saves them, a configuration built
 * from the AI_* environment variables stands in, so existing setups keep
 * working.
 *
 * Readers get a decrypted in-memory snapshot. It is reloaded after a save in
 * this process and at most REFRESH_MS later in other web processes.
 */

const REFRESH_MS = 15 * 1000
export const ROLES = ['chat', 'image', 'pdf', 'errorAssistant']
export const ENV_PROVIDER_ID = 'env'
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

export class AiProviderValidationError extends OError {}

let _snapshot = null
let _loadedAt = 0
let _loading = null
let _encryptor

// Built on first use so an instance without AI_PROVIDER_CIPHER_PASSWORD still
// starts and falls back to the environment variables
function getEncryptor() {
  if (_encryptor === undefined) {
    const label = process.env.AI_PROVIDER_CIPHER_LABEL || '2026.10-v3'
    const password = process.env.AI_PROVIDER_CIPHER_PASSWORD
    _encryptor = password
      ? new AccessTokenEncryptor({
          cipherLabel: label,
          cipherPasswords: { [label]: password },
        })
      : null
  }
  return _encryptor
}

export function isCipherConfigured() {
  try {
    return Boolean(getEncryptor())
  } catch (err) {
    logger.err({ err }, 'ai providers: invalid AI_PROVIDER_CIPHER_PASSWORD')
    return false
  }
}

/** The configuration the AI_* environment variables describe. */
export function envConfig() {
  const ai = Settings.workbenchAi || {}
  const models = []
  const idFor = model => {
    if (!model) return null
    let entry = models.find(m => m.model === model)
    if (!entry) {
      entry = { id: `env-${models.length + 1}`, model, label: '', selectable: false }
      models.push(entry)
    }
    return entry.id
  }
  const roles = {
    chat: idFor(ai.model),
    image: idFor(ai.imageModel),
    pdf: idFor(ai.pdfModel),
    errorAssistant: null,
  }
  const usable = Boolean(ai.baseURL && ai.apiKey)
  return {
    source: 'env',
    enabled: Boolean(ai.enabled),
    providers: usable
      ? [
          {
            id: ENV_PROVIDER_ID,
            name: 'Environment variables',
            baseURL: ai.baseURL,
            apiKey: ai.apiKey,
            models,
          },
        ]
      : [],
    roles: usable ? roles : { chat: null, image: null, pdf: null, errorAssistant: null },
  }
}

async function decryptKey(encrypted) {
  return await getEncryptor().promises.decryptToJson(encrypted)
}

async function encryptKey(apiKey) {
  return await getEncryptor().promises.encryptJson(apiKey)
}

async function fromDocument(doc) {
  const providers = []
  for (const provider of doc.providers || []) {
    let apiKey = null
    try {
      apiKey = await decryptKey(provider.apiKey)
    } catch (err) {
      // Its models fail like a wrong key would, the others keep working
      logger.err(
        { err, providerId: provider.id },
        'ai providers: could not decrypt API key, check AI_PROVIDER_CIPHER_PASSWORD'
      )
    }
    providers.push({
      id: provider.id,
      name: provider.name,
      baseURL: provider.baseURL,
      apiKey,
      models: (provider.models || []).map(m => ({
        id: m.id,
        model: m.model,
        label: m.label || '',
        selectable: Boolean(m.selectable),
      })),
    })
  }
  return {
    source: 'admin',
    enabled: Boolean(doc.enabled),
    providers,
    roles: Object.fromEntries(ROLES.map(role => [role, doc.roles?.[role] || null])),
    updatedAt: doc.updatedAt,
  }
}

async function load() {
  const doc = await AiProviderSettings.findOne({}).lean().exec()
  _snapshot = doc ? await fromDocument(doc) : null
  _loadedAt = Date.now()
}

/** Reloads the configuration; concurrent callers share one load. */
export async function refresh() {
  _loading ??= load().finally(() => {
    _loading = null
  })
  return await _loading
}

/** Waits for a configuration no older than REFRESH_MS. */
export async function ensureFresh() {
  if (Date.now() - _loadedAt > REFRESH_MS) {
    try {
      await refresh()
    } catch (err) {
      // Keep serving the last configuration while Mongo is unavailable
      logger.err({ err }, 'ai providers: could not load configuration')
    }
  }
}

/**
 * The configuration in effect, without waiting: the admin's if there is one,
 * otherwise the environment's. Starts a reload in the background when stale.
 */
export function current() {
  if (Date.now() - _loadedAt > REFRESH_MS && !_loading) {
    ensureFresh().catch(() => {})
  }
  return _snapshot || envConfig()
}

/** Finds a model and its provider by model id. */
export function findModel(config, modelId) {
  if (!modelId) return null
  for (const provider of config.providers) {
    const model = provider.models.find(m => m.id === modelId)
    if (model) return { provider, model }
  }
  return null
}

function keyHint(apiKey) {
  return apiKey ? `…${apiKey.slice(-4)}` : ''
}

/** The configuration for the admin page, with key hints instead of keys. */
export async function getAdminView() {
  await refresh()
  const config = _snapshot || envConfig()
  return {
    source: config.source,
    enabled: config.enabled,
    roles: config.roles,
    providers: config.providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      baseURL: provider.baseURL,
      apiKeyHint: keyHint(provider.apiKey),
      hasApiKey: Boolean(provider.apiKey),
      models: provider.models,
    })),
    cipherConfigured: isCipherConfigured(),
    updatedAt: config.updatedAt || null,
  }
}

function fail(message) {
  throw new AiProviderValidationError(message)
}

function text(value, field, { max = 200, optional = false } = {}) {
  if (value == null && optional) return ''
  if (typeof value !== 'string') fail(`${field} must be text`)
  const trimmed = value.trim()
  if (!trimmed && !optional) fail(`${field} is required`)
  if (trimmed.length > max) fail(`${field} is too long`)
  return trimmed
}

function baseUrl(value, field) {
  const url = text(value, field, { max: 500 })
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    fail(`${field} is not a valid URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail(`${field} must start with http:// or https://`)
  }
  return url.replace(/\/+$/, '')
}

/**
 * The stored or environment key of a provider, for a form that left the key
 * blank to keep it.
 */
export function existingApiKey(providerId) {
  const saved = _snapshot?.providers.find(p => p.id === providerId)
  if (saved) return saved.apiKey
  if (providerId === ENV_PROVIDER_ID) return Settings.workbenchAi?.apiKey || null
  return null
}

/**
 * Checks the form and turns it into the document to store. A blank API key
 * keeps the provider's current one.
 */
async function toDocument(input) {
  if (!input || typeof input !== 'object') fail('Invalid configuration')
  const ids = new Set()
  const uniqueId = (id, field) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) fail(`${field} has an invalid id`)
    if (ids.has(id)) fail(`${field} has a duplicate id`)
    ids.add(id)
    return id
  }

  if (!Array.isArray(input.providers) || input.providers.length > 50) {
    fail('Invalid list of providers')
  }
  const providers = []
  for (const [index, provider] of input.providers.entries()) {
    const field = `Provider ${index + 1}`
    const name = text(provider?.name, `${field} name`, { max: 100 })
    const label = `Provider "${name}"`
    const id = uniqueId(provider.id, label)
    const url = baseUrl(provider.baseURL, `${label} base URL`)
    const newKey = text(provider.apiKey, `${label} API key`, { max: 2000, optional: true })
    const apiKey = newKey || existingApiKey(id)
    if (!apiKey) fail(`${label} needs an API key`)
    if (!Array.isArray(provider.models) || provider.models.length === 0) {
      fail(`${label} needs at least one model`)
    }
    if (provider.models.length > 100) fail(`${label} has too many models`)
    const models = provider.models.map((model, modelIndex) => ({
      id: uniqueId(model?.id, `${label} model ${modelIndex + 1}`),
      model: text(model.model, `${label} model ${modelIndex + 1} name`),
      label: text(model.label, `${label} model ${modelIndex + 1} display name`, {
        max: 100,
        optional: true,
      }),
      selectable: model.selectable === true,
    }))
    providers.push({ id, name, baseURL: url, apiKey: await encryptKey(apiKey), models })
  }

  const modelIds = new Set(providers.flatMap(p => p.models.map(m => m.id)))
  const roles = {}
  for (const role of ROLES) {
    const value = input.roles?.[role] || null
    if (value !== null && !modelIds.has(value)) fail(`The model for "${role}" does not exist`)
    roles[role] = value
  }
  const enabled = input.enabled === true
  if (enabled && !roles.chat) fail('Choose a default chat model to enable AI')

  return { enabled, providers, roles, updatedAt: new Date() }
}

/** Validates and stores the admin's configuration. */
export async function save(input) {
  if (!isCipherConfigured()) {
    fail('Set AI_PROVIDER_CIPHER_PASSWORD (16 characters or more) to store API keys')
  }
  // Blank keys are taken from the configuration as it is now
  await refresh()
  const doc = await toDocument(input)
  await AiProviderSettings.findOneAndUpdate({}, doc, { upsert: true }).exec()
  await refresh()
}

/** Deletes the admin's configuration, back to the environment variables. */
export async function reset() {
  await AiProviderSettings.deleteMany({}).exec()
  await refresh()
}

export default {
  ROLES,
  ENV_PROVIDER_ID,
  AiProviderValidationError,
  isCipherConfigured,
  envConfig,
  refresh,
  ensureFresh,
  current,
  findModel,
  getAdminView,
  existingApiKey,
  save,
  reset,
}
