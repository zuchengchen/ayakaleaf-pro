import { ObjectId } from '../../../../app/src/infrastructure/mongodb.mjs'
import { WorkbenchChat } from '../models/WorkbenchChat.mjs'

/**
 * Keeps each user's AI assistant chats per project, so a new chat does not
 * lose the old ones and a reload comes back to the latest.
 */

// Chats kept per user and project; saving a new one drops the oldest
export const MAX_CHATS = 50
// Mongo documents stop at 16 MB; above this the attachments and rendered
// pages are left out
export const MAX_CHAT_BYTES = 8 * 1024 * 1024
const TITLE_LENGTH = 80
// Appended to the user's text by the browser, see message-view CONTEXT_OPEN
const CONTEXT_OPEN = '<editor-context>'

/** The start of the first thing the user wrote. */
export function titleOf(messages) {
  for (const message of messages) {
    if (message?.role !== 'user') continue
    for (const part of message.parts || []) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue
      const text = part.text.split(CONTEXT_OPEN)[0].replace(/\s+/g, ' ').trim()
      if (text) {
        return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text
      }
    }
  }
  return ''
}

/**
 * Replaces attached files and rendered PDF pages with a note, for chats too
 * large to store whole.
 */
export function withoutLargeData(messages) {
  return messages.map(message => ({
    ...message,
    parts: (message.parts || []).map(part => {
      if (part?.type === 'file') {
        return {
          type: 'text',
          text: `[${part.filename || 'An attached file'} was not kept in the chat history]`,
        }
      }
      if (part?.type === 'tool-render_pdf_page' && part.state === 'output-available') {
        return {
          ...part,
          state: 'output-error',
          output: undefined,
          errorText: 'The rendered page was not kept in the chat history.',
        }
      }
      return part
    }),
  }))
}

function sizeOf(value) {
  return Buffer.byteLength(JSON.stringify(value))
}

export async function listChats(userId, projectId) {
  const chats = await WorkbenchChat.find(
    { userId: new ObjectId(userId), projectId: new ObjectId(projectId) },
    { chatId: 1, title: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .limit(MAX_CHATS)
    .lean()
    .exec()
  return chats.map(chat => ({
    id: chat.chatId,
    title: chat.title,
    updatedAt: chat.updatedAt,
  }))
}

export async function getChat(userId, projectId, chatId) {
  const chat = await WorkbenchChat.findOne({
    userId: new ObjectId(userId),
    projectId: new ObjectId(projectId),
    chatId,
  })
    .lean()
    .exec()
  if (!chat) return null
  return {
    id: chat.chatId,
    title: chat.title,
    messages: chat.messages,
    summary: chat.summary,
    updatedAt: chat.updatedAt,
  }
}

/** Creates or replaces a chat, and drops the oldest beyond MAX_CHATS. */
export async function saveChat(userId, projectId, chatId, { messages, summary }) {
  const query = {
    userId: new ObjectId(userId),
    projectId: new ObjectId(projectId),
  }
  let stored = messages
  if (sizeOf(stored) > MAX_CHAT_BYTES) {
    stored = withoutLargeData(stored)
    if (sizeOf(stored) > MAX_CHAT_BYTES) return false
  }
  const now = new Date()
  await WorkbenchChat.updateOne(
    { ...query, chatId },
    {
      $set: { title: titleOf(stored), messages: stored, summary: summary || null, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  ).exec()

  const old = await WorkbenchChat.find(query, { _id: 1 })
    .sort({ updatedAt: -1 })
    .skip(MAX_CHATS)
    .lean()
    .exec()
  if (old.length) {
    await WorkbenchChat.deleteMany({ _id: { $in: old.map(chat => chat._id) } }).exec()
  }
  return true
}

export async function deleteChat(userId, projectId, chatId) {
  await WorkbenchChat.deleteOne({
    userId: new ObjectId(userId),
    projectId: new ObjectId(projectId),
    chatId,
  }).exec()
}

export async function deleteProjectChats(projectId) {
  await WorkbenchChat.deleteMany({ projectId: new ObjectId(projectId) }).exec()
}

export async function deleteUserChats(userId) {
  await WorkbenchChat.deleteMany({ userId: new ObjectId(userId) }).exec()
}

export default {
  MAX_CHATS,
  MAX_CHAT_BYTES,
  titleOf,
  withoutLargeData,
  listChats,
  getChat,
  saveChat,
  deleteChat,
  deleteProjectChats,
  deleteUserChats,
}
