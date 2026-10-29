import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb-legacy'

/**
 * Balances, redeem codes and free uses against the real Mongo and Redis of
 * the dev environment, since what matters is what they do when requests
 * race. Needs MONGO_URL (a throwaway database) and REDIS_HOST.
 */

const DAY_MS = 24 * 3600 * 1000

/** What a promise rejects with; fails the test if it resolves. */
async function rejection(promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected a rejection')
}

let Accounts, RedeemCodes, FreeUses, models, Router, mongoose

describe('AI billing storage', function () {
  beforeAll(async function () {
    vi.resetModules()
    if (!process.env.MONGO_URL?.includes('test')) {
      throw new Error('Set MONGO_URL to a test database to run these tests')
    }
    mongoose = (await import('../../../../../app/src/infrastructure/Mongoose.mjs')).default
    models = await import('../../../app/models/AiBilling.mjs')
    Accounts = (await import('../../../app/src/Accounts.mjs')).default
    RedeemCodes = await import('../../../app/src/RedeemCodes.mjs')
    FreeUses = (await import('../../../app/src/FreeUses.mjs')).default
    Router = await import('../../../app/src/AiBillingRouter.mjs')
    await mongoose.connection.asPromise()
    await Promise.all(
      ['aiAccounts', 'aiLedger', 'aiRedeemBatches', 'aiRedeemCodes'].map(name =>
        mongoose.connection.db.collection(name).deleteMany({})
      )
    )
    await models.createIndexes()
  })

  afterAll(async function () {
    await mongoose?.disconnect()
  })

  const newUser = () => new ObjectId()

  describe('redeem codes', function () {
    it('stores only hashes and credits a balance once', async function () {
      const user = newUser()
      const { batch, codes } = await RedeemCodes.generateBatch({ kind: 'balance', value: 5000000, count: 3 })
      expect(codes).toHaveLength(3)
      expect(codes[0]).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
      const stored = await models.AiRedeemCode.collection.find({ batchId: batch._id }).toArray()
      expect(stored).toHaveLength(3)
      for (const doc of stored) {
        expect(JSON.stringify(doc)).not.toContain(codes[0].replace(/-/g, ''))
        expect(doc.hash).toMatch(/^[0-9a-f]{64}$/)
      }

      const result = await RedeemCodes.redeem(user, codes[0].toLowerCase())
      expect(result).toMatchObject({ kind: 'balance', value: 5000000, account: { balance: 5000000 } })
      expect((await rejection(RedeemCodes.redeem(user, codes[0]))).reason).toBe('used')
      expect((await rejection(RedeemCodes.redeem(newUser(), codes[0]))).reason).toBe('used')
      expect((await Accounts.getAccount(user)).balance).toBe(5000000)

      const ledger = await Accounts.listLedger(user)
      expect(ledger).toHaveLength(1)
      expect(ledger[0]).toMatchObject({ type: 'redeem', amount: 5000000 })
    })

    it('lets only one of two simultaneous redeems of a code through', async function () {
      const [first, second] = [newUser(), newUser()]
      const { codes } = await RedeemCodes.generateBatch({ kind: 'balance', value: 1000000, count: 1 })
      const results = await Promise.allSettled([
        RedeemCodes.redeem(first, codes[0]),
        RedeemCodes.redeem(second, codes[0]),
        RedeemCodes.redeem(first, codes[0]),
      ])
      const fulfilled = results.filter(result => result.status === 'fulfilled')
      const rejected = results.filter(result => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected.map(result => result.reason.reason)).toEqual(['used', 'used'])
      const balances = [(await Accounts.getAccount(first)).balance, (await Accounts.getAccount(second)).balance]
      expect(balances.sort()).toEqual([0, 1000000])
    })

    it('adds VIP days after the current end', async function () {
      const user = newUser()
      const { codes } = await RedeemCodes.generateBatch({ kind: 'vip_days', value: 7, count: 2 })
      const before = Date.now()
      const once = await RedeemCodes.redeem(user, codes[0])
      expect(once.account.vipUntil.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS)
      expect(once.account.vipUntil.getTime()).toBeLessThan(Date.now() + 7 * DAY_MS + 1000)
      const twice = await RedeemCodes.redeem(user, codes[1])
      expect(twice.account.vipUntil.getTime()).toBe(once.account.vipUntil.getTime() + 7 * DAY_MS)
      expect(twice.account.balance).toBe(0)
      const ledger = await Accounts.listLedger(user)
      expect(ledger.map(entry => entry.vipDays)).toEqual([7, 7])
    })

    it('starts VIP days from now when the membership has ended', async function () {
      const user = newUser()
      await Accounts.adjust(newUser(), user, { vipUntil: new Date(Date.now() - 10 * DAY_MS) })
      const { codes } = await RedeemCodes.generateBatch({ kind: 'vip_days', value: 1, count: 1 })
      const { account } = await RedeemCodes.redeem(user, codes[0])
      expect(account.vipUntil.getTime()).toBeGreaterThan(Date.now() + DAY_MS - 5000)
    })

    it('refuses expired, voided, unknown and malformed codes', async function () {
      const user = newUser()
      const { batch: expiringBatch, codes: expiring } = await RedeemCodes.generateBatch({
        kind: 'balance',
        value: 1,
        count: 1,
        expiresInDays: 1,
      })
      await models.AiRedeemCode.collection.updateMany(
        { batchId: expiringBatch._id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } }
      )
      expect((await rejection(RedeemCodes.redeem(user, expiring[0]))).reason).toBe('expired')

      const { batch, codes } = await RedeemCodes.generateBatch({ kind: 'balance', value: 1, count: 3 })
      await RedeemCodes.redeem(user, codes[0])
      expect(await RedeemCodes.voidBatch(batch._id)).toBe(2)
      expect((await rejection(RedeemCodes.redeem(user, codes[1]))).reason).toBe('void')

      expect((await rejection(RedeemCodes.redeem(user, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ'))).reason).toBe('not_found')
      expect((await rejection(RedeemCodes.redeem(user, 'nope'))).reason).toBe('invalid')
      expect((await Accounts.getAccount(user)).balance).toBe(1)

      const [listed] = await RedeemCodes.listBatches({ limit: 1 })
      expect(listed).toMatchObject({ unused: 0, used: 1, void: 2 })
    })
  })

  describe('balances', function () {
    it('adds up simultaneous charges', async function () {
      const user = newUser()
      await Accounts.adjust(newUser(), user, { balance: 1000000, note: 'start' })
      await Promise.all(
        Array.from({ length: 20 }, () => Accounts.recordUsage({ userId: user, mode: 'paid', micro: 1234, tokens: {} }))
      )
      expect((await Accounts.getAccount(user)).balance).toBe(1000000 - 20 * 1234)
      const ledger = await Accounts.listLedger(user)
      expect(ledger).toHaveLength(21)
      expect(ledger.filter(entry => entry.type === 'usage').every(entry => entry.amount === -1234)).toBe(true)
    })

    it('may go below zero on the last charge', async function () {
      const user = newUser()
      await Accounts.recordUsage({ userId: user, mode: 'paid', micro: 500, tokens: {} })
      expect((await Accounts.getAccount(user)).balance).toBe(-500)
    })

    it('records free uses without touching the balance', async function () {
      const user = newUser()
      await Accounts.recordUsage({ userId: user, mode: 'free', micro: 0, tokens: { input: 1 } })
      expect(await Accounts.getAccount(user)).toEqual({ balance: 0, vipUntil: null })
      expect((await Accounts.listLedger(user))[0]).toMatchObject({ type: 'usage', mode: 'free', amount: 0 })
    })

    it('lets an admin end a membership and take money away', async function () {
      const user = newUser()
      await Accounts.adjust(newUser(), user, { vipDays: 30, balance: 2000000 })
      const account = await Accounts.adjust(newUser(), user, { vipUntil: null, balance: -500000, note: 'refund' })
      expect(account).toEqual({ balance: 1500000, vipUntil: null })
      const [latest] = await Accounts.listLedger(user)
      expect(latest).toMatchObject({ type: 'adjust', amount: -500000, vipUntil: null, note: 'refund' })
    })
  })

  describe('free uses', function () {
    it('gives out the daily free uses once each, even at the same time', async function () {
      const user = String(newUser())
      const taken = await Promise.all(Array.from({ length: 30 }, () => FreeUses.take(user, 20)))
      expect(taken.filter(Boolean)).toHaveLength(20)
      expect(await FreeUses.usedToday(user)).toBe(20)
      await FreeUses.giveBack(user, taken.find(Boolean))
      expect(await FreeUses.usedToday(user)).toBe(19)
      expect(await FreeUses.take(user, 20)).toBeTruthy()
      expect(await FreeUses.take(user, 20)).toBe(null)
    })

    it('starts again on the next Beijing day', async function () {
      const user = String(newUser())
      const evening = new Date('2026-11-02T15:59:59Z')
      const midnight = new Date('2026-11-02T16:00:00Z')
      expect(await FreeUses.take(user, 1, evening)).toBe('2026-11-02')
      expect(await FreeUses.take(user, 1, evening)).toBe(null)
      expect(await FreeUses.take(user, 1, midnight)).toBe('2026-11-03')
    })

    it('never goes below zero when giving back', async function () {
      const user = String(newUser())
      await FreeUses.giveBack(user, '2026-11-02')
      expect(await FreeUses.usedToday(user, new Date('2026-11-02T10:00:00+08:00'))).toBe(0)
    })

    it('remembers which messages were free', async function () {
      const user = String(newUser())
      await FreeUses.markTurn(user, 'msg-1', 'free')
      expect(await FreeUses.turnMode(user, 'msg-1')).toBe('free')
      expect(await FreeUses.turnMode(user, 'msg-2')).toBe(null)
      expect(await FreeUses.turnMode(user, null)).toBe(null)
    })
  })

  describe('rate limits', function () {
    it('lets a user try a few codes a minute', async function () {
      const key = `test-${new ObjectId()}`
      const limiter = Router.redeemRateLimiter
      for (let i = 0; i < 10; i++) await limiter.consume(key)
      expect((await rejection(limiter.consume(key))).remainingPoints).toBe(0)
      const ipKey = `test-${new ObjectId()}`
      for (let i = 0; i < 30; i++) await Router.redeemIpRateLimiter.consume(ipKey, 1, { method: 'ip' })
      expect((await rejection(Router.redeemIpRateLimiter.consume(ipKey, 1, { method: 'ip' }))).remainingPoints).toBe(0)
    })
  })
})
