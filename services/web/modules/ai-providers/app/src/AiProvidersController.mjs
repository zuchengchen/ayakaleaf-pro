import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '@overleaf/logger'
import { expressify } from '@overleaf/promise-utils'
import { APICallError, generateText } from 'ai'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import AiProviderStore, {
  AiProviderValidationError,
} from './AiProviderStore.mjs'
import { createProvider } from '../../../workbench/app/src/WorkbenchAiClient.mjs'

const __dirname = Path.dirname(fileURLToPath(import.meta.url))

const TEST_TIMEOUT_MS = 30 * 1000

async function page(req, res) {
  res.render(Path.resolve(__dirname, '../views/ai-providers'), {
    title: 'AI Providers',
  })
}

async function getConfig(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await AiProviderStore.getAdminView())
}

async function saveConfig(req, res) {
  try {
    await AiProviderStore.save(req.body)
  } catch (err) {
    if (err instanceof AiProviderValidationError) {
      return res.status(400).json({ message: err.message })
    }
    throw err
  }
  logger.info(
    { userId: SessionManager.getLoggedInUserId(req.session) },
    'ai providers configuration saved'
  )
  res.json(await AiProviderStore.getAdminView())
}

async function resetConfig(req, res) {
  await AiProviderStore.reset()
  logger.info(
    { userId: SessionManager.getLoggedInUserId(req.session) },
    'ai providers configuration reset to the environment variables'
  )
  res.json(await AiProviderStore.getAdminView())
}

/**
 * Sends a short prompt to a model with the gateway settings in the form, so
 * an admin can check them before saving. A blank key uses the stored one.
 */
async function testModel(req, res) {
  const { providerId, baseURL, apiKey, model } = req.body || {}
  if (
    typeof baseURL !== 'string' ||
    typeof model !== 'string' ||
    !model.trim() ||
    (apiKey != null && typeof apiKey !== 'string')
  ) {
    return res.status(400).json({ message: 'Base URL and model are required' })
  }
  try {
    const url = new URL(baseURL.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
  } catch {
    return res.status(400).json({ message: 'The base URL is not valid' })
  }
  const key =
    apiKey?.trim() ||
    (typeof providerId === 'string' && AiProviderStore.existingApiKey(providerId))
  if (!key) {
    return res.status(400).json({ message: 'Enter the API key to test' })
  }

  const started = Date.now()
  try {
    const provider = createProvider({ baseURL: baseURL.trim().replace(/\/+$/, ''), apiKey: key })
    const result = await generateText({
      model: provider(model.trim()),
      prompt: 'Reply with the word OK.',
      maxOutputTokens: 32,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    res.json({ ok: true, text: result.text.slice(0, 200), ms: Date.now() - started })
  } catch (err) {
    let message = err.message || 'The request failed'
    if (APICallError.isInstance(err)) {
      const body = typeof err.responseBody === 'string' ? err.responseBody.slice(0, 300) : ''
      message = [err.statusCode && `HTTP ${err.statusCode}`, body || err.message]
        .filter(Boolean)
        .join(': ')
    } else if (err.name === 'TimeoutError') {
      message = `No answer within ${TEST_TIMEOUT_MS / 1000} seconds`
    }
    res.json({ ok: false, message })
  }
}

export default {
  page: expressify(page),
  getConfig: expressify(getConfig),
  saveConfig: expressify(saveConfig),
  resetConfig: expressify(resetConfig),
  testModel: expressify(testModel),
}
