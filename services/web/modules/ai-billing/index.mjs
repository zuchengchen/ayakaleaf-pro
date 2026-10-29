import logger from '@overleaf/logger'
import AiBillingRouter from './app/src/AiBillingRouter.mjs'
import { createIndexes } from './app/models/AiBilling.mjs'

/**
 * @import { WebModule } from "../../types/web-module"
 */

// Charges for the AI assistant and the error assistant: free uses a day of
// the models an admin marks free, VIP membership, and a balance charged at
// each model's price. Balances and membership come from redeem codes sold
// in a shop. Off until an admin turns it on at Admin > AI Billing.

// Mongoose's autoIndex is off in web; the unique indexes keep one account per
// user and one document per code
createIndexes().catch(err => {
  logger.err({ err }, 'ai billing: could not create indexes')
})

/** @type {WebModule} */
const AiBillingModule = {
  router: AiBillingRouter,
}

export default AiBillingModule
