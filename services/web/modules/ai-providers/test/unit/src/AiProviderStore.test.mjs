import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/AiProviderStore.mjs'
)

const PASSWORD = 'a-test-cipher-password'

function providerInput(overrides = {}) {
  return {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1/',
    apiKey: 'sk-secret-1234',
    models: [
      { id: 'm1', model: 'gpt-4o', label: 'GPT-4o', selectable: true, efforts: [' High', 'low', 'high'] },
      { id: 'm2', model: 'gpt-4o-mini', label: '', selectable: false },
    ],
    ...overrides,
  }
}

function configInput(overrides = {}) {
  return {
    enabled: true,
    providers: [providerInput()],
    roles: { chat: 'm1', image: null, pdf: 'm2', errorAssistant: null },
    ...overrides,
  }
}

describe('AiProviderStore', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()
    process.env.AI_PROVIDER_CIPHER_PASSWORD = PASSWORD
    ctx.stored = null
    ctx.Settings = {
      workbenchAi: {
        enabled: true,
        baseURL: 'https://env.example.com/v1',
        apiKey: 'env-key',
        model: 'env-model',
        imageModel: 'env-vision',
        pdfModel: 'env-model',
      },
    }
    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('../../../app/models/AiProviderSettings.mjs', () => ({
      AiProviderSettings: {
        findOne: () => ({
          lean: () => ({ exec: async () => ctx.stored }),
        }),
        findOneAndUpdate: (query, doc) => ({
          exec: async () => {
            ctx.stored = doc
          },
        }),
        deleteMany: () => ({
          exec: async () => {
            ctx.stored = null
          },
        }),
      },
    }))
    ctx.Store = await import(modulePath)
  })

  afterEach(function () {
    delete process.env.AI_PROVIDER_CIPHER_PASSWORD
  })

  describe('without a saved configuration', function () {
    it('describes the environment variables', async function (ctx) {
      await ctx.Store.ensureFresh()
      const config = ctx.Store.current()
      expect(config.source).toBe('env')
      expect(config.enabled).toBe(true)
      expect(config.providers).toHaveLength(1)
      const [provider] = config.providers
      expect(provider.baseURL).toBe('https://env.example.com/v1')
      expect(provider.apiKey).toBe('env-key')
      // The PDF model is the chat model, listed once
      expect(provider.models.map(m => m.model)).toEqual(['env-model', 'env-vision'])
      expect(ctx.Store.findModel(config, config.roles.chat).model.model).toBe('env-model')
      expect(ctx.Store.findModel(config, config.roles.image).model.model).toBe('env-vision')
      expect(config.roles.pdf).toBe(config.roles.chat)
    })

    it('has no provider without a gateway', async function (ctx) {
      ctx.Settings.workbenchAi = { enabled: true, model: 'env-model' }
      await ctx.Store.ensureFresh()
      const config = ctx.Store.current()
      expect(config.providers).toEqual([])
      expect(config.roles.chat).toBeNull()
    })
  })

  describe('save', function () {
    it('stores the API key encrypted and serves it decrypted', async function (ctx) {
      await ctx.Store.save(configInput())
      const stored = ctx.stored.providers[0]
      expect(stored.apiKey).not.toContain('sk-secret-1234')
      expect(stored.baseURL).toBe('https://api.openai.com/v1')

      const config = ctx.Store.current()
      expect(config.source).toBe('admin')
      expect(config.providers[0].apiKey).toBe('sk-secret-1234')
      expect(config.roles).toEqual({
        chat: 'm1',
        image: null,
        pdf: 'm2',
        errorAssistant: null,
      })
    })

    it('keeps the reasoning efforts, cleaned up', async function (ctx) {
      await ctx.Store.save(configInput())
      const [first, second] = ctx.Store.current().providers[0].models
      expect(first.efforts).toEqual(['high', 'low'])
      expect(second.efforts).toEqual([])
    })

    it('refuses an invalid reasoning effort', async function (ctx) {
      await expect(
        ctx.Store.save(
          configInput({
            providers: [
              providerInput({ models: [{ id: 'm1', model: 'a', efforts: ['very high!'] }] }),
            ],
            roles: { chat: 'm1' },
          })
        )
      ).to.be.rejectedWith('invalid level')
    })

    it('keeps the saved key when the key is left blank', async function (ctx) {
      await ctx.Store.save(configInput())
      await ctx.Store.save(
        configInput({ providers: [providerInput({ apiKey: '', name: 'Renamed' })] })
      )
      const [provider] = ctx.Store.current().providers
      expect(provider.name).toBe('Renamed')
      expect(provider.apiKey).toBe('sk-secret-1234')
    })

    it('takes over the environment key for the environment provider', async function (ctx) {
      await ctx.Store.save(
        configInput({ providers: [providerInput({ id: 'env', apiKey: '' })] })
      )
      expect(ctx.Store.current().providers[0].apiKey).toBe('env-key')
    })

    it('refuses a new provider without a key', async function (ctx) {
      await expect(
        ctx.Store.save(configInput({ providers: [providerInput({ apiKey: '' })] }))
      ).to.be.rejectedWith('needs an API key')
    })

    it('refuses a base URL that is not http(s)', async function (ctx) {
      await expect(
        ctx.Store.save(
          configInput({ providers: [providerInput({ baseURL: 'file:///etc/passwd' })] })
        )
      ).to.be.rejectedWith('must start with http')
    })

    it('refuses a use pointing at a missing model', async function (ctx) {
      await expect(
        ctx.Store.save(configInput({ roles: { chat: 'nope' } }))
      ).to.be.rejectedWith('does not exist')
    })

    it('refuses to enable AI without a chat model', async function (ctx) {
      await expect(
        ctx.Store.save(configInput({ roles: { chat: null } }))
      ).to.be.rejectedWith('default chat model')
    })

    it('refuses duplicate ids', async function (ctx) {
      await expect(
        ctx.Store.save(
          configInput({
            providers: [
              providerInput({
                models: [
                  { id: 'm1', model: 'a' },
                  { id: 'm1', model: 'b' },
                ],
              }),
            ],
          })
        )
      ).to.be.rejectedWith('duplicate id')
    })

    it('needs the cipher password', async function (ctx) {
      vi.resetModules()
      delete process.env.AI_PROVIDER_CIPHER_PASSWORD
      const Store = await import(modulePath)
      await expect(Store.save(configInput())).to.be.rejectedWith(
        'AI_PROVIDER_CIPHER_PASSWORD'
      )
    })
  })

  describe('getAdminView', function () {
    it('shows a hint instead of the key', async function (ctx) {
      await ctx.Store.save(configInput())
      const view = await ctx.Store.getAdminView()
      expect(JSON.stringify(view)).not.toContain('sk-secret-1234')
      expect(view.providers[0].apiKeyHint).toBe('…1234')
      expect(view.providers[0].hasApiKey).toBe(true)
      expect(view.cipherConfigured).toBe(true)
    })
  })

  describe('reset', function () {
    it('goes back to the environment variables', async function (ctx) {
      await ctx.Store.save(configInput())
      await ctx.Store.reset()
      expect(ctx.Store.current().source).toBe('env')
    })
  })
})
