import Settings from '@overleaf/settings'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { HttpsProxyAgent } from 'https-proxy-agent'
import nodeFetch from 'node-fetch'
import { Readable } from 'node:stream'
import AiProviderStore from '../../../ai-providers/app/src/AiProviderStore.mjs'

/**
 * Configures the AI SDK providers, optional HTTP proxy, and model selection
 * for the workbench gateway.
 */

// LOCAL: gateways and models come from the admin's AI providers page, or
// from the AI_* environment variables until an admin saves one
let _providers = new Map()
let _proxyFetch = null

/** Waits for a recent AI providers configuration. */
export async function loadAiConfig() {
  await AiProviderStore.ensureFresh()
}

/** Whether an admin, or AI_ENABLED, turned AI on. */
export function isEnabled() {
  return AiProviderStore.current().enabled
}

/**
 * Whether AI is enabled and its default chat model has a gateway and API key.
 */
export function isConfigured() {
  const config = AiProviderStore.current()
  const chat = AiProviderStore.findModel(config, config.roles.chat)
  return Boolean(config.enabled && chat?.provider.baseURL && chat.provider.apiKey)
}

/**
 * When AI_PROXY_URL is set, route the gateway calls through an HTTP proxy.
 * Node's global fetch (undici) ignores http.Agent proxies, so we fetch through
 * node-fetch (which honours the proxy agent) and re-wrap its Node stream body
 * as a WHATWG Response, keeping the AI SDK's streaming (getReader/pipeThrough)
 * working. No proxy configured -> undefined -> the SDK uses global fetch.
 */
function _getProxyFetch() {
  const proxyUrl = Settings.workbenchAi?.proxyUrl
  if (!proxyUrl) {
    return undefined
  }
  if (!_proxyFetch) {
    const agent = new HttpsProxyAgent(proxyUrl)
    _proxyFetch = async (url, init = {}) => {
      const res = await nodeFetch(url, { ...init, agent })
      const body = res.body ? Readable.toWeb(res.body) : null
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: [...res.headers],
      })
    }
  }
  return _proxyFetch
}

/** Builds an OpenAI-compatible provider for a gateway. */
export function createProvider({ baseURL, apiKey }) {
  const config = {
    name: 'workbench',
    baseURL,
    apiKey,
    includeUsage: true,
  }
  const proxyFetch = _getProxyFetch()
  if (proxyFetch) {
    config.fetch = proxyFetch
  }
  return createOpenAICompatible(config)
}

/** The language model for a model id, with its gateway's provider cached. */
function languageModel(config, modelId) {
  const found = AiProviderStore.findModel(config, modelId)
  if (!found) return null
  const { provider, model } = found
  const key = `${provider.baseURL}\n${provider.apiKey}`
  if (!_providers.has(key)) {
    // Providers of edited or removed gateways pile up; start over now and then
    if (_providers.size > 50) _providers = new Map()
    _providers.set(key, createProvider(provider))
  }
  return _providers.get(key)(model.model)
}

/**
 * The models users can pick in the chat, as { id, label, provider, efforts },
 * and the reasoning efforts of the default chat model.
 */
export function getSelectableModels() {
  const config = AiProviderStore.current()
  return config.providers.flatMap(provider =>
    provider.models
      .filter(model => model.selectable)
      .map(model => ({
        id: model.id,
        label: model.label || model.model,
        provider: provider.name,
        efforts: model.efforts || [],
      }))
  )
}

/** The default chat model as { id, label, efforts }, or null. */
export function getDefaultModel() {
  const config = AiProviderStore.current()
  const found = AiProviderStore.findModel(config, config.roles.chat)
  if (!found) return null
  return {
    id: found.model.id,
    label: found.model.label || found.model.model,
    efforts: found.model.efforts || [],
  }
}

/** The model for one use (see AiProviderStore.ROLES); unset uses the chat model. */
export function getRoleModel(role) {
  const config = AiProviderStore.current()
  return (
    languageModel(config, config.roles[role]) ||
    languageModel(config, config.roles.chat)
  )
}

/** Whether a user attached a PDF anywhere in the conversation. */
export function hasPdf(messages = []) {
  return messages.some(message =>
    message.parts?.some(
      part => part.type === 'file' && part.mediaType === 'application/pdf'
    )
  )
}

/**
 * Selects the language model for a chat request: the model the user picked
 * if users may pick it, otherwise the configured PDF, image or chat model.
 */
export function resolveModel(messages = [], choice = null) {
  const config = AiProviderStore.current()
  return languageModel(config, resolveModelId(config, messages, choice))
}

/**
 * The reasoning effort to send with a chat request: the user's pick, if the
 * model resolveModel picks offers it.
 */
export function resolveReasoningEffort(messages = [], choice = null, effort = null) {
  if (!effort) return undefined
  const config = AiProviderStore.current()
  const found = AiProviderStore.findModel(config, resolveModelId(config, messages, choice))
  return found?.model.efforts?.includes(effort) ? effort : undefined
}

function resolveModelId(config, messages, choice) {
  const role = id => (AiProviderStore.findModel(config, id) ? id : config.roles.chat)
  if (choice && AiProviderStore.findModel(config, choice)?.model.selectable) {
    return choice
  }
  // Follow-up requests retain earlier attachments, so route the entire conversation.
  if (config.roles.pdf && hasPdf(messages)) {
    return role(config.roles.pdf)
  }
  if (
    config.roles.image &&
    messages.some(message =>
      message.parts?.some(
        part =>
          (part.type === 'file' && part.mediaType?.startsWith('image/')) ||
          (part.type === 'tool-render_pdf_page' && part.state === 'output-available')
      )
    )
  ) {
    return role(config.roles.image)
  }
  return config.roles.chat
}

/** Maximum tool calls per user message, including automatic continuations. */
export function getMaxSteps() {
  const limit = Settings.workbenchAi?.maxSteps
  return Number.isSafeInteger(limit) && limit > 0 ? limit : 20
}

/**
 * The agent's instructions: look at the project through the tools, keep
 * edits small, answer in the user's language.
 */
export const SYSTEM_PROMPT = `You work inside a collaborative LaTeX editor as the writing and TeX assistant for the project the user has open. Help them write, fix, explain and restructure their document.

Ground every answer in the project, not in guesses:
- Look before you answer: get_file, get_lines and find_in_file show the source of a document by its path; list_project_files shows what exists; new_file adds a document.
- For build problems, call get_problems, or run_compile to get a fresh log; render_pdf_page and get_pdf_outline show the output; choose_compiler switches the engine.
- To change text, call propose_edit. Nothing changes until the user applies it, so pass the current text of the lines as oldText exactly as it is, touch only what the request needs, and say why in a short reason.
- Results of tools from earlier turns may be shortened or dropped; call the tool again when you need them in full or up to date.

The user's message can end with an <editor-context> block naming the open file and what is selected in it; it comes again when the user opens another file. Use it, but do not quote it back.

Answer in the language of the user's latest message, whatever language the document is in. Keep answers short and practical, in Markdown: LaTeX source in fenced code blocks, inline math in $...$ and displayed math in $$...$$, and a dollar sign that is not math as \\$. When a request is unclear, ask one short question first.`

export default {
  loadAiConfig,
  isEnabled,
  isConfigured,
  createProvider,
  getSelectableModels,
  getDefaultModel,
  getRoleModel,
  resolveModel,
  resolveReasoningEffort,
  getMaxSteps,
  SYSTEM_PROMPT,
}
