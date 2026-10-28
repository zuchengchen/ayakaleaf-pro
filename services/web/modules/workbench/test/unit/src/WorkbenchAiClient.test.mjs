import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/WorkbenchAiClient.mjs'
)

const pdfMessage = {
  role: 'user',
  parts: [{ type: 'file', mediaType: 'application/pdf', url: 'data:' }],
}
const imageMessage = {
  role: 'user',
  parts: [{ type: 'file', mediaType: 'image/png', url: 'data:' }],
}

describe('WorkbenchAiClient', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()
    ctx.config = {
      enabled: true,
      providers: [
        {
          id: 'a',
          name: 'Gateway A',
          baseURL: 'https://a.example.com/v1',
          apiKey: 'key-a',
          models: [
            { id: 'chat', model: 'a-chat', label: 'Chat', selectable: false, efforts: ['low', 'high'] },
            { id: 'pick', model: 'a-pick', label: '', selectable: true, efforts: [] },
          ],
        },
        {
          id: 'b',
          name: 'Gateway B',
          baseURL: 'https://b.example.com/v1',
          apiKey: 'key-b',
          models: [
            { id: 'pdf', model: 'b-pdf', label: 'PDF', selectable: false },
            { id: 'vision', model: 'b-vision', label: 'Vision', selectable: true, efforts: ['medium'] },
          ],
        },
      ],
      roles: { chat: 'chat', image: 'vision', pdf: 'pdf', errorAssistant: null },
    }
    vi.doMock('@overleaf/settings', () => ({ default: { workbenchAi: {} } }))
    vi.doMock('../../../../ai-providers/app/src/AiProviderStore.mjs', () => ({
      default: {
        ensureFresh: async () => {},
        current: () => ctx.config,
        findModel(config, modelId) {
          for (const provider of config.providers) {
            const model = provider.models.find(m => m.id === modelId)
            if (model) return { provider, model }
          }
          return null
        },
      },
    }))
    vi.doMock('@ai-sdk/openai-compatible', () => ({
      createOpenAICompatible:
        ({ baseURL, apiKey }) =>
        model => ({ baseURL, apiKey, model }),
    }))
    ctx.Client = await import(modulePath)
  })

  it('is configured when enabled with a chat model', function (ctx) {
    expect(ctx.Client.isConfigured()).toBe(true)
    ctx.config.enabled = false
    expect(ctx.Client.isConfigured()).toBe(false)
  })

  it('is not configured when the chat model is missing', function (ctx) {
    ctx.config.roles.chat = null
    expect(ctx.Client.isConfigured()).toBe(false)
  })

  it('lists the models users can pick', function (ctx) {
    expect(ctx.Client.getSelectableModels()).toEqual([
      { id: 'pick', label: 'a-pick', provider: 'Gateway A', efforts: [] },
      { id: 'vision', label: 'Vision', provider: 'Gateway B', efforts: ['medium'] },
    ])
    expect(ctx.Client.getDefaultModel()).toEqual({ id: 'chat', label: 'Chat', efforts: ['low', 'high'] })
  })

  it('sends a reasoning effort only to a model that offers it', function (ctx) {
    expect(ctx.Client.resolveReasoningEffort([], null, 'high')).toBe('high')
    expect(ctx.Client.resolveReasoningEffort([], null, 'medium')).toBeUndefined()
    expect(ctx.Client.resolveReasoningEffort([], 'vision', 'medium')).toBe('medium')
    expect(ctx.Client.resolveReasoningEffort([], 'pick', 'high')).toBeUndefined()
    // A chat with a PDF file goes to the PDF model, which has no efforts
    expect(ctx.Client.resolveReasoningEffort([pdfMessage], null, 'high')).toBeUndefined()
    expect(ctx.Client.resolveReasoningEffort([], null, null)).toBeUndefined()
  })

  it('uses the chat model by default', function (ctx) {
    expect(ctx.Client.resolveModel([])).toEqual({
      baseURL: 'https://a.example.com/v1',
      apiKey: 'key-a',
      model: 'a-chat',
    })
  })

  it('routes chats with PDF files and images', function (ctx) {
    expect(ctx.Client.resolveModel([pdfMessage]).model).toBe('b-pdf')
    expect(ctx.Client.resolveModel([imageMessage]).model).toBe('b-vision')
  })

  it('uses a model the user picked, even with a PDF file', function (ctx) {
    expect(ctx.Client.resolveModel([pdfMessage], 'pick')).toEqual({
      baseURL: 'https://a.example.com/v1',
      apiKey: 'key-a',
      model: 'a-pick',
    })
  })

  it('ignores a pick of a model users may not pick', function (ctx) {
    expect(ctx.Client.resolveModel([], 'pdf').model).toBe('a-chat')
    expect(ctx.Client.resolveModel([], 'gone').model).toBe('a-chat')
  })

  it('falls back to the chat model for a use without one', function (ctx) {
    expect(ctx.Client.getRoleModel('errorAssistant').model).toBe('a-chat')
    expect(ctx.Client.getRoleModel('pdf').model).toBe('b-pdf')
  })
})
