import logger from '@overleaf/logger'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import AiProvidersController from './AiProvidersController.mjs'

export default {
  apply(webRouter) {
    logger.debug({}, 'Init AiProviders router')

    webRouter.get(
      '/admin/ai-providers',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      AiProvidersController.page
    )
    webRouter.get(
      '/admin/ai-providers/config',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      AiProvidersController.getConfig
    )
    webRouter.post(
      '/admin/ai-providers/config',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      AiProvidersController.saveConfig
    )
    webRouter.delete(
      '/admin/ai-providers/config',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      AiProvidersController.resetConfig
    )
    webRouter.post(
      '/admin/ai-providers/test',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      AiProvidersController.testModel
    )
  },
}
