import { describe, expect, it } from 'vitest'
import {
  PriceValidationError,
  costOf,
  currentRatesInYuan,
  isPeak,
  normalizeUsage,
  selectRates,
  validatePrice,
} from '../../../app/src/Pricing.mjs'
import { beijingDate, nextBeijingMidnight } from '../../../app/src/BeijingTime.mjs'

const rates = (input, cachedInput, output, cacheWrite = null) => ({ input, cachedInput, cacheWrite, output })

const PEAK = {
  weekdays: [1, 2, 3, 4, 5],
  ranges: [
    { from: '09:00', to: '12:00' },
    { from: '14:00', to: '18:00' },
  ],
}

function flat(base, currency = 'CNY') {
  return { currency, peak: null, schedules: [{ from: null, tiers: [{ above: 0, rates: base, offPeak: null }] }] }
}

// Monday 2 November 2026, as a Beijing time
const beijing = time => new Date(`2026-11-02T${time}+08:00`)

describe('BeijingTime', function () {
  it('rolls the date over at midnight in Beijing, 16:00 UTC', function () {
    expect(beijingDate(new Date('2026-10-29T15:59:59Z'))).toBe('2026-10-29')
    expect(beijingDate(new Date('2026-10-29T16:00:00Z'))).toBe('2026-10-30')
  })

  it('finds the next Beijing midnight', function () {
    expect(nextBeijingMidnight(new Date('2026-10-29T15:59:59Z')).toISOString()).toBe('2026-10-29T16:00:00.000Z')
    expect(nextBeijingMidnight(new Date('2026-10-29T16:00:00Z')).toISOString()).toBe('2026-10-30T16:00:00.000Z')
  })
})

describe('Pricing', function () {
  describe('normalizeUsage', function () {
    it('splits input into uncached, cache hits and cache writes', function () {
      expect(
        normalizeUsage({
          inputTokens: 1000,
          inputTokenDetails: { cacheReadTokens: 300, cacheWriteTokens: 200 },
          outputTokens: 50,
        })
      ).toEqual({ input: 1000, noCache: 500, cacheRead: 300, cacheWrite: 200, output: 50 })
    })

    it('reads the older cachedInputTokens and ignores missing or bad counts', function () {
      expect(normalizeUsage({ inputTokens: 10, cachedInputTokens: 4, outputTokens: -3 })).toEqual({
        input: 10,
        noCache: 6,
        cacheRead: 4,
        cacheWrite: 0,
        output: 0,
      })
      expect(normalizeUsage(undefined)).toEqual({ input: 0, noCache: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
    })
  })

  describe('costOf', function () {
    it('charges each kind of token at its rate, in millionths of a yuan', function () {
      const price = flat(rates(2, 0.5, 8, 2.5))
      const usage = {
        inputTokens: 1000,
        inputTokenDetails: { cacheReadTokens: 400, cacheWriteTokens: 100 },
        outputTokens: 100,
      }
      // 500×2 + 400×0.5 + 100×2.5 + 100×8
      expect(costOf(price, usage, { usdToCny: 7 }).micro).toBe(1000 + 200 + 250 + 800)
    })

    it('charges cache hits and writes as input when they have no rate', function () {
      const price = flat(rates(2, null, 8, null))
      const usage = {
        inputTokens: 1000,
        inputTokenDetails: { cacheReadTokens: 400, cacheWriteTokens: 100 },
        outputTokens: 0,
      }
      expect(costOf(price, usage, { usdToCny: 7 }).micro).toBe(2000)
    })

    it('converts US dollars and applies the markup', function () {
      const price = flat(rates(1, null, 10), 'USD')
      const usage = { inputTokens: 100, outputTokens: 10 }
      // (100×1 + 10×10) × 7.2 × 1.5
      expect(costOf(price, usage, { usdToCny: 7.2, markup: 1.5 }).micro).toBe(2160)
    })

    it('rounds up to a whole millionth, without floating point leftovers', function () {
      expect(costOf(flat(rates(0.1, null, 0)), { inputTokens: 3 }, { usdToCny: 7 }).micro).toBe(1)
      // 0.1 × 30 is 3.0000000000000004 in floating point
      expect(costOf(flat(rates(0.1, null, 0)), { inputTokens: 30 }, { usdToCny: 7 }).micro).toBe(3)
      expect(Number.isInteger(costOf(flat(rates(0.07, 0.013, 0.11)), { inputTokens: 977, cachedInputTokens: 13, outputTokens: 331 }, { usdToCny: 7 }).micro)).toBe(true)
    })

    it('costs nothing for no tokens', function () {
      expect(costOf(flat(rates(2, 0.5, 8)), {}, { usdToCny: 7 }).micro).toBe(0)
    })
  })

  describe('dated rates', function () {
    const price = {
      currency: 'USD',
      peak: null,
      schedules: [
        { from: null, tiers: [{ above: 0, rates: rates(2, 0.1, 10), offPeak: null }] },
        { from: '2026-12-01', tiers: [{ above: 0, rates: rates(4, 0.2, 20), offPeak: null }] },
      ],
    }

    it('switches at the start of the date in Beijing', function () {
      const before = selectRates(price, { at: new Date('2026-11-30T23:59:59+08:00') })
      const after = selectRates(price, { at: new Date('2026-12-01T00:00:00+08:00') })
      expect(before.rates.input).toBe(2)
      expect(before.from).toBe(null)
      expect(after.rates.input).toBe(4)
      expect(after.from).toBe('2026-12-01')
    })
  })

  describe('long context tiers', function () {
    const price = {
      currency: 'USD',
      peak: null,
      schedules: [
        {
          from: null,
          tiers: [
            { above: 0, rates: rates(2, 0.2, 12), offPeak: null },
            { above: 200000, rates: rates(4, 0.4, 18), offPeak: null },
          ],
        },
      ],
    }

    it('charges the higher tier only above the threshold', function () {
      expect(selectRates(price, { inputTokens: 200000 }).rates.input).toBe(2)
      expect(selectRates(price, { inputTokens: 200001 }).rates.input).toBe(4)
      expect(selectRates(price, { inputTokens: 200001 }).above).toBe(200000)
      const cost = costOf(price, { inputTokens: 200001, outputTokens: 0 }, { usdToCny: 1 })
      expect(cost.micro).toBe(800004)
      expect(cost.price.above).toBe(200000)
    })
  })

  describe('peak hours', function () {
    const price = {
      currency: 'CNY',
      peak: PEAK,
      schedules: [{ from: null, tiers: [{ above: 0, rates: rates(2, 0.04, 8), offPeak: rates(1, 0.02, 4) }] }],
    }

    it('follows the Beijing clock on weekdays', function () {
      expect(isPeak(PEAK, beijing('08:59:59'))).toBe(false)
      expect(isPeak(PEAK, beijing('09:00:00'))).toBe(true)
      expect(isPeak(PEAK, beijing('11:59:59'))).toBe(true)
      expect(isPeak(PEAK, beijing('12:00:00'))).toBe(false)
      expect(isPeak(PEAK, beijing('13:59:59'))).toBe(false)
      expect(isPeak(PEAK, beijing('14:00:00'))).toBe(true)
      expect(isPeak(PEAK, beijing('17:59:59'))).toBe(true)
      expect(isPeak(PEAK, beijing('18:00:00'))).toBe(false)
    })

    it('is the same moment in UTC', function () {
      expect(isPeak(PEAK, new Date('2026-11-02T00:59:59Z'))).toBe(false)
      expect(isPeak(PEAK, new Date('2026-11-02T01:00:00Z'))).toBe(true)
      expect(isPeak(PEAK, new Date('2026-11-02T09:59:59Z'))).toBe(true)
      expect(isPeak(PEAK, new Date('2026-11-02T10:00:00Z'))).toBe(false)
    })

    it('is off-peak at weekends and on the off-peak dates', function () {
      expect(isPeak(PEAK, new Date('2026-11-07T10:00:00+08:00'))).toBe(false)
      expect(isPeak(PEAK, new Date('2026-11-08T15:00:00+08:00'))).toBe(false)
      expect(isPeak(PEAK, beijing('10:00:00'), ['2026-11-02'])).toBe(false)
      expect(isPeak(PEAK, beijing('10:00:00'), ['2026-11-03'])).toBe(true)
    })

    it('charges the off-peak rates outside the peak hours', function () {
      const usage = { inputTokens: 1000, outputTokens: 100 }
      const peak = costOf(price, usage, { at: beijing('10:00:00'), usdToCny: 7 })
      const offPeak = costOf(price, usage, { at: beijing('20:00:00'), usdToCny: 7 })
      expect(peak.micro).toBe(2800)
      expect(peak.price.period).toBe('peak')
      expect(offPeak.micro).toBe(1400)
      expect(offPeak.price.period).toBe('offPeak')
      const holiday = costOf(price, usage, { at: beijing('10:00:00'), usdToCny: 7, offPeakDates: ['2026-11-02'] })
      expect(holiday.micro).toBe(1400)
    })

    it('shows the rates of the moment in yuan', function () {
      expect(currentRatesInYuan(price, { at: beijing('10:00:00'), usdToCny: 7 })).toEqual({
        input: 2,
        cachedInput: 0.04,
        output: 8,
        period: 'peak',
      })
      expect(currentRatesInYuan(flat(rates(1.25, null, 10), 'USD'), { usdToCny: 7.2 })).toEqual({
        input: 9,
        cachedInput: null,
        output: 72,
        period: null,
      })
    })
  })

  describe('validatePrice', function () {
    const valid = () => ({
      currency: 'USD',
      peak: null,
      schedules: [
        { from: 'ignored', tiers: [{ above: 99, rates: { input: '1', cachedInput: '', output: 2 } }] },
        { from: '2027-01-01', tiers: [{ above: 0, rates: rates(2, 0.2, 4) }, { above: 1000, rates: rates(3, null, 5) }] },
      ],
    })

    it('normalizes a valid price', function () {
      const price = validatePrice(valid())
      expect(price.schedules[0].from).toBe(null)
      expect(price.schedules[0].tiers[0]).toEqual({
        above: 0,
        rates: { input: 1, cachedInput: null, cacheWrite: null, output: 2 },
        offPeak: null,
      })
      expect(price.schedules[1].tiers[1].above).toBe(1000)
    })

    it('drops off-peak rates without peak hours', function () {
      const input = valid()
      input.schedules[0].tiers[0].offPeak = rates(1, null, 1)
      expect(validatePrice(input).schedules[0].tiers[0].offPeak).toBe(null)
    })

    it.each([
      ['an unknown currency', p => (p.currency = 'EUR')],
      ['no schedules', p => (p.schedules = [])],
      ['a negative rate', p => (p.schedules[0].tiers[0].rates.input = -1)],
      ['a missing output rate', p => delete p.schedules[0].tiers[0].rates.output],
      ['a bad date', p => (p.schedules[1].from = '2027-13-45')],
      ['dates out of order', p => p.schedules.push({ from: '2026-01-01', tiers: [{ above: 0, rates: rates(1, null, 1) }] })],
      ['tiers out of order', p => (p.schedules[1].tiers[1].above = 0)],
      ['a peak range that ends first', p => (p.peak = { weekdays: [1], ranges: [{ from: '12:00', to: '09:00' }] })],
      ['peak hours without weekdays', p => (p.peak = { weekdays: [], ranges: [{ from: '09:00', to: '12:00' }] })],
      ['a bad peak time', p => (p.peak = { weekdays: [1], ranges: [{ from: '9', to: '12:00' }] })],
    ])('refuses %s', function (_name, change) {
      const input = valid()
      change(input)
      expect(() => validatePrice(input)).toThrow(PriceValidationError)
    })
  })
})
