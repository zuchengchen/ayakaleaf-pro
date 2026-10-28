import logger from '@overleaf/logger'
import Modules from '../../app/src/infrastructure/Modules.mjs'
import ChatHistoryRouter from './app/src/ChatHistoryRouter.mjs'
import ChatHistoryManager from './app/src/ChatHistoryManager.mjs'
import { WorkbenchChat } from './app/models/WorkbenchChat.mjs'

/**
 * @import { WebModule } from "../../types/web-module"
 */

// Keeps each user's AI assistant chats per project in mongo (workbenchChats),
// listed by the history button of the assistant panel.

// Mongoose's autoIndex is off in web; the unique index keeps saves of one
// chat from creating two documents
WorkbenchChat.createIndexes().catch(err => {
  logger.err({ err }, 'chat history: could not create indexes')
})

Modules.hooks.attach('projectExpired', async projectId => {
  try {
    await ChatHistoryManager.deleteProjectChats(projectId)
  } catch (err) {
    logger.warn({ err, projectId }, 'on project expire: failed to remove AI chats')
  }
})

Modules.hooks.attach('expireDeletedUser', async userId => {
  try {
    await ChatHistoryManager.deleteUserChats(userId)
  } catch (err) {
    logger.warn({ err, userId }, 'on user expire: failed to remove AI chats')
  }
})

/** @type {WebModule} */
const ChatHistoryModule = {
  router: ChatHistoryRouter,
}

export default ChatHistoryModule
