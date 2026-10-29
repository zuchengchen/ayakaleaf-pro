import logger from '@overleaf/logger'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import RateLimiterMiddleware from '../../../../app/src/Features/Security/RateLimiterMiddleware.mjs'
import { RateLimiter } from '../../../../app/src/infrastructure/RateLimiter.mjs'
import AiBillingController from './AiBillingController.mjs'
import AiBillingAdminController from './AiBillingAdminController.mjs'

// Guessing codes: a few tries a minute per user, and per address
export const redeemRateLimiter = new RateLimiter('ai-billing-redeem', { points: 10, duration: 60 })
export const redeemIpRateLimiter = new RateLimiter('ai-billing-redeem-ip', { points: 30, duration: 60 })

export default {
  apply(webRouter) {
    logger.debug({}, 'Init AiBilling router')

    const login = AuthenticationController.requireLogin()
    const admin = AuthorizationMiddleware.ensureUserIsSiteAdmin

    webRouter.get('/ai/account', login, AiBillingController.accountPage)
    // A link from the shop: logging in comes back here with the code
    webRouter.get('/ai/redeem', login, AiBillingController.redeemPage)
    webRouter.get('/ai-billing/status', login, AiBillingController.status)
    webRouter.get('/ai-billing/ledger', login, AiBillingController.ledger)
    webRouter.post(
      '/ai-billing/redeem',
      login,
      RateLimiterMiddleware.rateLimit(redeemIpRateLimiter, { ipOnly: true }),
      RateLimiterMiddleware.rateLimit(redeemRateLimiter),
      AiBillingController.redeem
    )

    webRouter.get('/admin/ai-billing', admin, AiBillingAdminController.page)
    webRouter.get('/admin/ai-billing/settings', admin, AiBillingAdminController.getSettings)
    webRouter.post('/admin/ai-billing/settings', admin, AiBillingAdminController.saveSettings)
    webRouter.get('/admin/ai-billing/batches', admin, AiBillingAdminController.listBatches)
    webRouter.post('/admin/ai-billing/batches', admin, AiBillingAdminController.generateBatch)
    webRouter.post('/admin/ai-billing/batches/:batchId/void', admin, AiBillingAdminController.voidBatch)
    webRouter.get('/admin/ai-billing/users', admin, AiBillingAdminController.findUser)
    webRouter.get('/admin/ai-billing/users/:userId/ledger', admin, AiBillingAdminController.userLedger)
    webRouter.post('/admin/ai-billing/users/:userId/adjust', admin, AiBillingAdminController.adjustUser)
  },
}
