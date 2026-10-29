import type { BillingDenial } from '@modules/ai-billing/frontend/js/billing-notices'

/**
 * Errors the chat tells apart: the quota is used up, AI is off for the user,
 * the per-message tool budget ran out, or a tool declined to run.
 */

/** 429 from the chat endpoint. */
export class QuotaExceededError extends Error {
  constructor() {
    super('AI quota used up')
    this.name = 'QuotaExceededError'
  }
}

/** 403 from the chat endpoint. */
export class AiUnavailableError extends Error {
  constructor() {
    super('AI is not available')
    this.name = 'AiUnavailableError'
  }
}

/** 409 from the chat endpoint. */
export class ToolBudgetError extends Error {
  constructor() {
    super(
      'The assistant used all the steps it may take for one message. Reply to let it carry on.'
    )
    this.name = 'ToolBudgetError'
  }
}

/** LOCAL: a request billing refused (ai-billing module). */
export class BillingError extends Error {
  denial: BillingDenial
  constructor(denial: BillingDenial) {
    super(denial.error)
    this.name = 'BillingError'
    this.denial = denial
  }
}

/** A tool that refused to run; its message goes back to the model. */
export class ToolRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolRefusal'
  }
}
