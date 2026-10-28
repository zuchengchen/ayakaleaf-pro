import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import WorkbenchController from './WorkbenchController.mjs'
import PermissionsMiddleware from './PermissionsMiddleware.mjs'
import { isConfigured, loadAiConfig } from './WorkbenchAiClient.mjs'

export default {
  apply(webRouter) {
    webRouter.use('/project', (req, res, next) => {
      // LOCAL: the admin's AI providers configuration is loaded from Mongo
      loadAiConfig().then(() => {
        res.locals.ExposedSettings.aiAvailable = isConfigured()
        next()
      }, next)
    })
    webRouter.get(
      '/workbench/access',
      AuthenticationController.requireLogin(),
      WorkbenchController.getAccess
    )
    // Workbench AI chat (Vercel AI SDK useChat endpoint). The global JSON body
    // parser (12 MB by default) handles the UI-message history payload.
    webRouter.post(
      '/workbench/chat',
      AuthenticationController.requireLogin(),
      PermissionsMiddleware.requireAiAccess,
      WorkbenchController.chat
    )
  },
}
