import AiProvidersRouter from './app/src/AiProvidersRouter.mjs'

/**
 * @import { WebModule } from "../../types/web-module"
 */

// Lets admins set up the AI gateways (base URL, API key, models) used by the
// workbench and the error assistant, pick a model for each use, and choose
// which models users can pick in the chat. API keys are stored encrypted:
//   AI_PROVIDER_CIPHER_PASSWORD — required to save; 16 characters or more
//   AI_PROVIDER_CIPHER_LABEL    — optional; cipher label, default 2026.10-v3
// Until an admin saves a configuration, the AI_* environment variables of
// the workbench module are used.

/** @type {WebModule} */
const AiProvidersModule = {
  router: AiProvidersRouter,
}

export default AiProvidersModule
