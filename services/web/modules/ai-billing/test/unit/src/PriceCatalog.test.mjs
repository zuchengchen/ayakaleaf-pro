import { describe, expect, it } from 'vitest'
import { PRESETS, baseModelName, findPreset } from '../../../app/src/PriceCatalog.mjs'
import { costOf, selectRates, validatePrice } from '../../../app/src/Pricing.mjs'

const usage = { inputTokens: 1000000, outputTokens: 1000000 }

describe('PriceCatalog', function () {
  it('only has prices the admin page accepts', function () {
    for (const preset of PRESETS) {
      expect(validatePrice(preset.price), preset.ids.join()).toEqual(preset.price)
    }
  })

  it('lists each model name once', function () {
    const ids = PRESETS.flatMap(preset => preset.ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('matches names with a vendor prefix or a date suffix', function () {
    expect(baseModelName('deepseek/DeepSeek-V4-Pro')).toBe('deepseek-v4-pro')
    expect(baseModelName('models/gemini-2.5-pro')).toBe('gemini-2.5-pro')
    expect(baseModelName('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
    expect(baseModelName('gpt-4o-2024-11-20')).toBe('gpt-4o')
  })

  it('has no price for unknown models', function () {
    expect(findPreset('qwen3.8-max')).toBe(null)
    expect(findPreset('gpt-5-mini-preview')).toBe(null)
    expect(findPreset('')).toBe(null)
  })

  it('gives a copy, so editing it leaves the catalog alone', function () {
    findPreset('gpt-5').price.schedules[0].tiers[0].rates.input = 999
    expect(findPreset('gpt-5').price.schedules[0].tiers[0].rates.input).toBe(1.25)
  })

  describe('DeepSeek, in yuan with peak hours', function () {
    // A Monday
    const peak = new Date('2026-11-02T10:00:00+08:00')
    const offPeak = new Date('2026-11-02T20:00:00+08:00')

    it('prices deepseek-flash and its old names', function () {
      for (const name of ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']) {
        const preset = findPreset(name)
        expect(preset.vendor).toBe('deepseek')
        expect(preset.price.currency).toBe('CNY')
        expect(selectRates(preset.price, { at: peak }).rates).toEqual({ input: 2, cachedInput: 0.04, cacheWrite: null, output: 8 })
        expect(selectRates(preset.price, { at: offPeak }).rates).toEqual({ input: 1, cachedInput: 0.02, cacheWrite: null, output: 4 })
      }
    })

    it('prices deepseek-v4-pro', function () {
      const { price } = findPreset('deepseek-v4-pro')
      expect(costOf(price, usage, { at: peak, usdToCny: 7 }).micro).toBe((9 + 27) * 1000000)
      expect(costOf(price, usage, { at: offPeak, usdToCny: 7 }).micro).toBe((4.5 + 13.5) * 1000000)
    })

    it('makes weekends off-peak', function () {
      const { price } = findPreset('deepseek-flash')
      expect(selectRates(price, { at: new Date('2026-11-07T10:00:00+08:00') }).period).toBe('offPeak')
    })
  })

  describe('OpenAI', function () {
    it('prices gpt-5', function () {
      const preset = findPreset('gpt-5')
      expect(preset.source).toBe('https://developers.openai.com/api/docs/pricing')
      expect(preset.fetchedAt).toBe('2026-10-29')
      expect(selectRates(preset.price).rates).toEqual({ input: 1.25, cachedInput: 0.125, cacheWrite: null, output: 10 })
    })

    it('charges more above 272K input tokens for the flagship models', function () {
      const { price } = findPreset('gpt-5.5')
      expect(selectRates(price, { inputTokens: 272000 }).rates.input).toBe(5)
      expect(selectRates(price, { inputTokens: 272001 }).rates).toEqual({ input: 10, cachedInput: 1, cacheWrite: null, output: 45 })
    })
  })

  describe('Anthropic', function () {
    it('prices cache writes', function () {
      expect(selectRates(findPreset('claude-sonnet-4-5-20250929').price).rates).toEqual({
        input: 3,
        cachedInput: 0.3,
        cacheWrite: 3.75,
        output: 15,
      })
      expect(selectRates(findPreset('claude-opus-5-5').price).rates).toEqual({ input: 4, cachedInput: 0.2, cacheWrite: 5, output: 20 })
    })

    it('charges more above 100,000 prompt tokens for Haiku 5.5', function () {
      const { price } = findPreset('claude-haiku-5-5')
      expect(selectRates(price, { inputTokens: 100000 }).rates.input).toBe(0.1)
      expect(selectRates(price, { inputTokens: 100001 }).rates).toEqual({ input: 0.5, cachedInput: 0.05, cacheWrite: 0.625, output: 2.5 })
    })
  })

  describe('Gemini', function () {
    it('changes price on the announced date', function () {
      const { price } = findPreset('gemini-4-argon')
      expect(selectRates(price, { at: new Date('2026-11-30T12:00:00+08:00') }).rates).toEqual({ input: 2, cachedInput: 0.1, cacheWrite: null, output: 10 })
      expect(selectRates(price, { at: new Date('2026-12-01T12:00:00+08:00') }).rates).toEqual({ input: 4, cachedInput: 0.2, cacheWrite: null, output: 20 })
    })

    it('charges more above 200K prompt tokens for the Pro models', function () {
      const { price } = findPreset('models/gemini-2.5-pro')
      expect(selectRates(price, { inputTokens: 200000 }).rates.output).toBe(10)
      expect(selectRates(price, { inputTokens: 200001 }).rates.output).toBe(15)
    })
  })
})
