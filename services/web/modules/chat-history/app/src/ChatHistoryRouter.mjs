import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import ChatHistoryController from './ChatHistoryController.mjs'

// Each user sees only their own chats, in projects they can still read
export default {
  apply(webRouter) {
    const guard = [
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.ensureUserCanReadProject,
    ]
    webRouter.get('/project/:Project_id/workbench/chats', ...guard, ChatHistoryController.list)
    webRouter.get('/project/:Project_id/workbench/chats/:chatId', ...guard, ChatHistoryController.get)
    webRouter.put('/project/:Project_id/workbench/chats/:chatId', ...guard, ChatHistoryController.save)
    webRouter.delete('/project/:Project_id/workbench/chats/:chatId', ...guard, ChatHistoryController.remove)
  },
}
