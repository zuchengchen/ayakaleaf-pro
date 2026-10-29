import { beforeEach, describe, expect, it, vi } from 'vitest'

const modulePath = '../../../app/src/AiBilling.mjs'

const flatPrice = (input, output) => ({
  currency: 'CNY',
  peak: null,
  schedules: [
    { from: null, tiers: [{ above: 0, rates: { input, cachedInput: null, cacheWrite: null, output }, offPeak: null }] },
  ],
})

const USAGE = { inputTokens: 1000, outputTokens: 100 }

describe('AiBilling', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()
    ctx.settings = {
      enabled: true,
      freeDailyUses: 2,
      markup: 1,
      usdToCny: 7,
      offPeakDates: [],
      shopUrl: 'https://shop.example.com',
    }
    ctx.models = {
      flash: { billing: 'free_quota', price: flatPrice(2, 8) },
      gratis: { billing: 'free_quota', price: null },
      gpt: { billing: 'metered', price: flatPrice(10, 40) },
      unpriced: { billing: 'metered', price: null },
      off: { billing: 'disabled', price: null },
    }
    ctx.account = { balance: 0, vipUntil: null }
    ctx.recorded = []
    ctx.free = { used: 0, given: 0, turns: new Map() }

    vi.doMock('../../../../../app/src/infrastructure/mongodb.mjs', () => ({
      ObjectId: class {
        static isValid() {
          return false
        }
      },
    }))
    vi.doMock('../../../app/src/BillingStore.mjs', () => ({
      default: {
        ensureFresh: async () => {},
        current: () => ctx.settings,
        modelBilling: id => ctx.models[id] || { billing: null, price: null },
      },
    }))
    vi.doMock('../../../app/src/Accounts.mjs', () => ({
      isVip: (account, at = new Date()) => Boolean(account.vipUntil && account.vipUntil > at),
      default: {
        getAccount: async () => ctx.account,
        recordUsage: async entry => {
          ctx.recorded.push(entry)
        },
      },
    }))
    vi.doMock('../../../app/src/FreeUses.mjs', () => ({
      default: {
        usedToday: async () => ctx.free.used,
        take: async (userId, limit) => {
          if (ctx.free.used >= limit) return null
          ctx.free.used++
          return '2026-11-02'
        },
        giveBack: async () => {
          ctx.free.used--
          ctx.free.given++
        },
        markTurn: async (userId, turn, mode) => {
          if (turn) ctx.free.turns.set(turn, mode)
        },
        turnMode: async (userId, turn) => ctx.free.turns.get(turn) ?? null,
      },
    }))
    const providers = [
      {
        name: 'Gateway',
        models: Object.keys(ctx.models).map(id => ({ id, model: `${id}-model`, label: '' })),
      },
    ]
    vi.doMock('../../../../ai-providers/app/src/AiProviderStore.mjs', () => ({
      default: {
        ensureFresh: async () => {},
        current: () => ({ providers, roles: { chat: 'flash', image: 'gpt', pdf: null, errorAssistant: null } }),
        findModel: (config, id) => {
          const model = providers[0].models.find(m => m.id === id)
          return model ? { provider: providers[0], model } : null
        },
      },
    }))
    ctx.AiBilling = (await import(modulePath)).default
    ctx.authorize = options => ctx.AiBilling.authorize({ userId: 'user-1', newTurn: true, turn: 'msg-1', ...options })
  })

  describe('with billing off', function () {
    it('allows every model and records nothing', async function (ctx) {
      ctx.settings.enabled = false
      const result = await ctx.authorize({ modelId: 'off' })
      expect(result).toEqual({ ok: true, ticket: { mode: 'off', userId: 'user-1' } })
      await ctx.AiBilling.settle(result.ticket, USAGE, { feature: 'chat' })
      expect(ctx.recorded).toEqual([])
      expect(ctx.free.used).toBe(0)
      expect(ctx.AiBilling.isModelOffered('off')).toBe(true)
    })
  })

  describe('models that are not offered', function () {
    for (const modelId of ['off', 'unpriced', 'unknown']) {
      it(`refuses ${modelId}`, async function (ctx) {
        const result = await ctx.authorize({ modelId })
        expect(result).toEqual({ ok: false, denial: { status: 403, error: 'ai_model_unavailable' } })
        expect(ctx.AiBilling.isModelOffered(modelId)).toBe(false)
      })
    }

    it('offers free and priced models', function (ctx) {
      expect(ctx.AiBilling.isModelOffered('flash')).toBe(true)
      expect(ctx.AiBilling.isModelOffered('gratis')).toBe(true)
      expect(ctx.AiBilling.isModelOffered('gpt')).toBe(true)
    })
  })

  describe('free uses', function () {
    it('takes one free use per new message, and charges nothing', async function (ctx) {
      const result = await ctx.authorize({ modelId: 'flash' })
      expect(result.ok).toBe(true)
      expect(result.ticket).toMatchObject({ mode: 'free', freeDate: '2026-11-02', vip: false })
      expect(ctx.free.used).toBe(1)
      await ctx.AiBilling.settle(result.ticket, USAGE, { feature: 'chat' })
      expect(ctx.recorded).toHaveLength(1)
      expect(ctx.recorded[0]).toMatchObject({ userId: 'user-1', mode: 'free', micro: 0, modelId: 'flash', model: 'flash-model' })
    })

    it('keeps the requests that carry on a free reply free, without taking another use', async function (ctx) {
      await ctx.authorize({ modelId: 'flash' })
      const next = await ctx.authorize({ modelId: 'flash', newTurn: false })
      expect(next.ticket.mode).toBe('free')
      expect(next.ticket.freeDate).toBe(null)
      expect(ctx.free.used).toBe(1)
    })

    it('charges the balance once the free uses are gone', async function (ctx) {
      ctx.free.used = 2
      ctx.account.balance = 5000000
      const result = await ctx.authorize({ modelId: 'flash' })
      expect(result.ticket).toMatchObject({ mode: 'paid', freeDate: null })
      await ctx.AiBilling.settle(result.ticket, USAGE, { feature: 'chat' })
      // 1000×2 + 100×8
      expect(ctx.recorded[0]).toMatchObject({ mode: 'paid', micro: 2800, price: { from: null, above: 0, period: null } })
    })

    it('asks for a top-up when the free uses are gone and the balance is empty', async function (ctx) {
      ctx.free.used = 2
      const result = await ctx.authorize({ modelId: 'flash' })
      expect(result).toEqual({
        ok: false,
        denial: { status: 402, error: 'ai_balance_insufficient', freeExhausted: true },
      })
    })

    it('stops at the free uses for a free model without a price', async function (ctx) {
      ctx.free.used = 2
      ctx.account.balance = 5000000
      const result = await ctx.authorize({ modelId: 'gratis' })
      expect(result).toEqual({ ok: false, denial: { status: 429, error: 'ai_free_quota_exhausted' } })
    })

    it('charges a carried-on reply that was not free', async function (ctx) {
      ctx.free.used = 2
      const result = await ctx.authorize({ modelId: 'flash', newTurn: false, turn: 'msg-unknown' })
      expect(result.denial.status).toBe(402)
    })

    it('gives back the free use of a request that produced nothing, once', async function (ctx) {
      const { ticket } = await ctx.authorize({ modelId: 'flash' })
      await ctx.AiBilling.refund(ticket)
      await ctx.AiBilling.refund(ticket)
      expect(ctx.free.used).toBe(0)
      expect(ctx.free.given).toBe(1)
    })
  })

  describe('VIP', function () {
    it('uses free models without counting and without charge', async function (ctx) {
      ctx.account.vipUntil = new Date(Date.now() + 86400000)
      ctx.free.used = 2
      const result = await ctx.authorize({ modelId: 'flash' })
      expect(result.ticket).toMatchObject({ mode: 'vip', vip: true })
      expect(ctx.free.used).toBe(2)
      await ctx.AiBilling.settle(result.ticket, USAGE, { feature: 'chat' })
      expect(ctx.recorded[0]).toMatchObject({ mode: 'vip', micro: 0 })
    })

    it('ends with the membership', async function (ctx) {
      ctx.account.vipUntil = new Date(Date.now() - 1000)
      const result = await ctx.authorize({ modelId: 'flash' })
      expect(result.ticket.mode).toBe('free')
    })

    it('still pays for metered models', async function (ctx) {
      ctx.account.vipUntil = new Date(Date.now() + 86400000)
      ctx.account.balance = 1
      const result = await ctx.authorize({ modelId: 'gpt' })
      expect(result.ticket.mode).toBe('paid')
      await ctx.AiBilling.settle(result.ticket, USAGE, { feature: 'chat' })
      expect(ctx.recorded[0]).toMatchObject({ mode: 'paid', micro: 1000 * 10 + 100 * 40 })
    })
  })

  describe('metered models', function () {
    it('need a balance above zero', async function (ctx) {
      expect(await ctx.authorize({ modelId: 'gpt' })).toEqual({
        ok: false,
        denial: { status: 402, error: 'ai_balance_insufficient', freeExhausted: false },
      })
      ctx.account.balance = -5
      expect((await ctx.authorize({ modelId: 'gpt' })).ok).toBe(false)
      ctx.account.balance = 1
      expect((await ctx.authorize({ modelId: 'gpt' })).ticket.mode).toBe('paid')
      expect(ctx.free.used).toBe(0)
    })

    it('charge a summary at the price of the model that wrote it', async function (ctx) {
      const { ticket } = await ctx.authorize({ modelId: 'flash' })
      await ctx.AiBilling.settle(ticket, USAGE, { modelId: 'gpt', feature: 'compaction' })
      expect(ctx.recorded[0]).toMatchObject({ mode: 'paid', modelId: 'gpt', feature: 'compaction', micro: 14000 })
    })

    it('record a model that lost its price as unpriced', async function (ctx) {
      ctx.account.balance = 1
      const { ticket } = await ctx.authorize({ modelId: 'gpt' })
      ctx.models.gpt = { billing: 'metered', price: null }
      await ctx.AiBilling.settle(ticket, USAGE, { feature: 'chat' })
      expect(ctx.recorded[0]).toMatchObject({ mode: 'unpriced', micro: 0 })
    })
  })

  describe('getStatus', function () {
    it('lists the offered models with their rates in yuan', async function (ctx) {
      ctx.account = { balance: 1230000, vipUntil: null }
      ctx.free.used = 1
      const status = await ctx.AiBilling.getStatus('user-1')
      expect(status).toMatchObject({
        enabled: true,
        shopUrl: 'https://shop.example.com',
        balance: 1230000,
        vip: false,
        free: { limit: 2, used: 1 },
        roles: { chat: 'flash', image: 'gpt' },
      })
      expect(Object.keys(status.models).sort()).toEqual(['flash', 'gpt', 'gratis'])
      expect(status.models.gpt).toEqual({
        label: 'gpt-model',
        billing: 'metered',
        rates: { input: 10, cachedInput: null, output: 40, period: null },
      })
      expect(status.models.gratis.rates).toBe(null)
    })

    it('says only that billing is off', async function (ctx) {
      ctx.settings.enabled = false
      expect(await ctx.AiBilling.getStatus('user-1')).toEqual({
        enabled: false,
        roles: { chat: 'flash', image: 'gpt', pdf: null, errorAssistant: null },
      })
    })
  })
})
