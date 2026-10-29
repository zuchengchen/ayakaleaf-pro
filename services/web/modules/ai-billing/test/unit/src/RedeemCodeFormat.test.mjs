import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('RedeemCodes format', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()
    // The format needs no database
    vi.doMock('../../../app/models/AiBilling.mjs', () => ({ AiRedeemBatch: {}, AiRedeemCode: {} }))
    vi.doMock('../../../app/src/Accounts.mjs', () => ({ default: {} }))
    vi.doMock('../../../../../app/src/infrastructure/mongodb.mjs', () => ({ ObjectId: class {} }))
    ctx.RedeemCodes = await import('../../../app/src/RedeemCodes.mjs')
  })

  it('makes 16 character codes from the Crockford alphabet', function (ctx) {
    const codes = new Set()
    for (let i = 0; i < 2000; i++) {
      const code = ctx.RedeemCodes.newCode()
      expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/)
      codes.add(code)
    }
    expect(codes.size).toBe(2000)
  })

  it('shows codes in groups of four', function (ctx) {
    expect(ctx.RedeemCodes.formatCode('ABCD0123EFGH4567')).toBe('ABCD-0123-EFGH-4567')
  })

  it('reads codes as people type them', function (ctx) {
    const { normalizeCode } = ctx.RedeemCodes
    expect(normalizeCode(' abcd-0123 efgh-4567 ')).toBe('ABCD0123EFGH4567')
    // Letters that look like digits
    expect(normalizeCode('ABCD-O123-EFGH-4567')).toBe('ABCD0123EFGH4567')
    expect(normalizeCode('ABCD-0I23-EFGH-4567')).toBe('ABCD0123EFGH4567')
    expect(normalizeCode('ABCD-0L23-EFGH-4567')).toBe('ABCD0123EFGH4567')
  })

  it('refuses what cannot be a code', function (ctx) {
    const { normalizeCode } = ctx.RedeemCodes
    expect(normalizeCode('ABCD-0123-EFGH')).toBe(null)
    expect(normalizeCode('ABCD-0123-EFGH-45678')).toBe(null)
    // U is not in the alphabet
    expect(normalizeCode('ABCD-0123-EFGH-456U')).toBe(null)
    expect(normalizeCode(null)).toBe(null)
    expect(normalizeCode('A'.repeat(200))).toBe(null)
  })

  it('keeps a SHA-256 of the code, not the code', function (ctx) {
    const hash = ctx.RedeemCodes.hashCode('ABCD0123EFGH4567')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('ABCD')
    expect(ctx.RedeemCodes.hashCode('ABCD0123EFGH4567')).toBe(hash)
  })
})
