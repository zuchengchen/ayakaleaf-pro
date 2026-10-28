import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import ChatHistoryManager from './ChatHistoryManager.mjs'

const CHAT_ID = /^[A-Za-z0-9_-]{1,64}$/

function ids(req) {
  return {
    userId: SessionManager.getLoggedInUserId(req.session),
    projectId: req.params.Project_id,
    chatId: req.params.chatId,
  }
}

function validChatId(req, res) {
  if (CHAT_ID.test(req.params.chatId || '')) return true
  res.status(400).json({ error: 'invalid_chat_id' })
  return false
}

async function list(req, res) {
  const { userId, projectId } = ids(req)
  res.set('Cache-Control', 'no-store')
  res.json({ chats: await ChatHistoryManager.listChats(userId, projectId) })
}

async function get(req, res) {
  if (!validChatId(req, res)) return
  const { userId, projectId, chatId } = ids(req)
  const chat = await ChatHistoryManager.getChat(userId, projectId, chatId)
  if (!chat) return res.status(404).json({ error: 'not_found' })
  res.set('Cache-Control', 'no-store')
  res.json(chat)
}

async function save(req, res) {
  if (!validChatId(req, res)) return
  const { messages, summary } = req.body || {}
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !messages.every(message => message && typeof message === 'object' && Array.isArray(message.parts)) ||
    (summary != null &&
      (typeof summary.summary !== 'string' || typeof summary.upToMessageId !== 'string'))
  ) {
    return res.status(400).json({ error: 'invalid_request' })
  }
  const { userId, projectId, chatId } = ids(req)
  const saved = await ChatHistoryManager.saveChat(userId, projectId, chatId, {
    messages,
    summary: summary ? { summary: summary.summary, upToMessageId: summary.upToMessageId } : null,
  })
  if (!saved) return res.status(413).json({ error: 'chat_too_large' })
  res.sendStatus(204)
}

async function remove(req, res) {
  if (!validChatId(req, res)) return
  const { userId, projectId, chatId } = ids(req)
  await ChatHistoryManager.deleteChat(userId, projectId, chatId)
  res.sendStatus(204)
}

export default {
  list: expressify(list),
  get: expressify(get),
  save: expressify(save),
  remove: expressify(remove),
}
