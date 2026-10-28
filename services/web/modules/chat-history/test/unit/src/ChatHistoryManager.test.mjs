import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/ChatHistoryManager.mjs'
)

const USER = '507f1f77bcf86cd799439011'
const PROJECT = '507f1f77bcf86cd799439022'

const query = result => ({
  sort: () => query(result),
  skip: () => query(result),
  limit: () => query(result),
  lean: () => query(result),
  exec: async () => result,
})

describe('ChatHistoryManager', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()
    ctx.updates = []
    ctx.deleted = []
    ctx.old = []
    vi.doMock('../../../app/models/WorkbenchChat.mjs', () => ({
      WorkbenchChat: {
        updateOne: (filter, update, options) => ({
          exec: async () => ctx.updates.push({ filter, update, options }),
        }),
        find: () => query(ctx.old),
        deleteMany: filter => ({ exec: async () => ctx.deleted.push(filter) }),
      },
    }))
    ctx.Manager = (await import(modulePath)).default
  })

  describe('titleOf', function () {
    it('takes the first user text without the editor context', function (ctx) {
      expect(
        ctx.Manager.titleOf([
          { role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
          {
            role: 'user',
            parts: [
              { type: 'file', url: 'data:' },
              { type: 'text', text: '  Fix my\ntable <editor-context>\nOpen file: main.tex' },
            ],
          },
        ])
      ).toBe('Fix my table')
    })

    it('shortens long text', function (ctx) {
      const title = ctx.Manager.titleOf([
        { role: 'user', parts: [{ type: 'text', text: 'x'.repeat(200) }] },
      ])
      expect(title).toHaveLength(80)
      expect(title.endsWith('…')).toBe(true)
    })
  })

  describe('withoutLargeData', function () {
    it('replaces files and rendered pages with notes', function (ctx) {
      const [message] = ctx.Manager.withoutLargeData([
        {
          role: 'user',
          parts: [
            { type: 'text', text: 'look' },
            { type: 'file', filename: 'scan.pdf', url: 'data:application/pdf;base64,AAAA' },
            { type: 'tool-render_pdf_page', state: 'output-available', output: 'AAAA' },
          ],
        },
      ])
      expect(message.parts[0]).toEqual({ type: 'text', text: 'look' })
      expect(message.parts[1]).toEqual({
        type: 'text',
        text: '[scan.pdf was not kept in the chat history]',
      })
      expect(message.parts[2].state).toBe('output-error')
      expect(message.parts[2].output).toBeUndefined()
    })
  })

  describe('saveChat', function () {
    const messages = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }]

    it('upserts the chat with a title', async function (ctx) {
      const saved = await ctx.Manager.saveChat(USER, PROJECT, 'chat-1', {
        messages,
        summary: null,
      })
      expect(saved).toBe(true)
      const [{ filter, update, options }] = ctx.updates
      expect(filter.chatId).toBe('chat-1')
      expect(filter.userId.toString()).toBe(USER)
      expect(filter.projectId.toString()).toBe(PROJECT)
      expect(update.$set.title).toBe('hello')
      expect(update.$set.messages).toEqual(messages)
      expect(options).toEqual({ upsert: true })
      expect(ctx.deleted).toEqual([])
    })

    it('drops the chats beyond the limit', async function (ctx) {
      ctx.old = [{ _id: 'a' }, { _id: 'b' }]
      await ctx.Manager.saveChat(USER, PROJECT, 'chat-1', { messages, summary: null })
      expect(ctx.deleted).toEqual([{ _id: { $in: ['a', 'b'] } }])
    })

    it('leaves out attachments of a chat that is too large', async function (ctx) {
      const big = 'A'.repeat(ctx.Manager.MAX_CHAT_BYTES)
      await ctx.Manager.saveChat(USER, PROJECT, 'chat-1', {
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [
              { type: 'text', text: 'see' },
              { type: 'file', filename: 'a.png', url: `data:image/png;base64,${big}` },
            ],
          },
        ],
        summary: null,
      })
      const stored = ctx.updates[0].update.$set.messages
      expect(stored[0].parts[1].text).toContain('a.png was not kept')
    })

    it('refuses a chat too large even without attachments', async function (ctx) {
      const saved = await ctx.Manager.saveChat(USER, PROJECT, 'chat-1', {
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'x'.repeat(ctx.Manager.MAX_CHAT_BYTES) }],
          },
        ],
        summary: null,
      })
      expect(saved).toBe(false)
      expect(ctx.updates).toEqual([])
    })
  })
})
