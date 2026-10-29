/**
 * What the chat and the error assistant show about billing: why a request
 * was refused, today's free uses and balance, and which model attachments
 * send a message to.
 */
import { useTranslation } from 'react-i18next'
import Notification from '@/shared/components/notification'
import { freeLeft, useBillingStatus } from './billing-status'
import { describeModel, formatYuan } from './format'

/** The billing errors the AI endpoints answer with. */
export const BILLING_ERRORS = [
  'ai_balance_insufficient',
  'ai_free_quota_exhausted',
  'ai_model_unavailable',
  'ai_billing_unavailable',
] as const

export type BillingErrorCode = (typeof BILLING_ERRORS)[number]

export type BillingDenial = { error: BillingErrorCode; freeExhausted?: boolean }

/** The billing error in a refused response, or null. */
export async function billingDenialOf(response: Response): Promise<BillingDenial | null> {
  if (![402, 403, 429, 503].includes(response.status)) return null
  try {
    const body = await response.clone().json()
    return BILLING_ERRORS.includes(body?.error) ? body : null
  } catch {
    return null
  }
}

function Links({ shopUrl }: { shopUrl?: string }) {
  const { t } = useTranslation()
  return (
    <span className="d-inline-flex flex-wrap gap-2 ms-1">
      <a href="/ai/account" target="_blank" rel="noopener">
        {t('ai_account')}
      </a>
      {shopUrl && (
        <a href={shopUrl} target="_blank" rel="noopener noreferrer">
          {t('ai_billing_buy_codes')}
        </a>
      )}
    </span>
  )
}

export function BillingNotice({ denial, className = 'my-2' }: { denial: BillingDenial; className?: string }) {
  const { t } = useTranslation()
  const status = useBillingStatus()
  const shopUrl = status?.enabled ? status.shopUrl : undefined
  let title
  let text
  let links = true
  switch (denial.error) {
    case 'ai_balance_insufficient':
      title = denial.freeExhausted ? t('ai_billing_free_used_up') : t('ai_billing_balance_empty')
      text = denial.freeExhausted ? t('ai_billing_top_up_or_vip') : t('ai_billing_top_up_for_model')
      break
    case 'ai_free_quota_exhausted':
      title = t('ai_billing_free_used_up')
      text = t('ai_billing_free_resets_or_vip')
      break
    case 'ai_model_unavailable':
      text = t('ai_billing_model_unavailable')
      links = false
      break
    default:
      text = t('ai_billing_unavailable')
      links = false
  }
  return (
    <Notification
      type={links ? 'warning' : 'error'}
      className={className}
      title={title}
      content={
        <>
          {text}
          {links && <Links shopUrl={shopUrl} />}
        </>
      }
    />
  )
}

/** One line under the chat: free uses or VIP, the balance, the account page. */
export function BillingSummary() {
  const { t } = useTranslation()
  const status = useBillingStatus()
  if (!status?.enabled) return null
  const parts = [
    status.vip && status.vipUntil
      ? t('ai_billing_vip_until', { date: new Date(status.vipUntil).toLocaleDateString() })
      : t('ai_billing_free_today', { left: freeLeft(status), limit: status.free.limit }),
    t('ai_billing_balance_is', { amount: formatYuan(status.balance) }),
  ]
  return (
    <span className="text-nowrap">
      {parts.join(' · ')} ·{' '}
      <a href="/ai/account" target="_blank" rel="noopener">
        {t('ai_account')}
      </a>
    </span>
  )
}

/**
 * Says which model a message with images or PDF files goes to and what it
 * costs, unless the user picked a model, which then takes them.
 */
export function AttachmentModelNotice({ files, pickedModel }: { files: File[]; pickedModel: string }) {
  const { t } = useTranslation()
  const status = useBillingStatus()
  if (!status?.enabled || pickedModel || files.length === 0) return null
  // As the server routes them: PDF files first, then images
  const hasPdf = files.some(file => file.type === 'application/pdf')
  const hasImage = files.some(file => file.type.startsWith('image/'))
  const modelId = (hasPdf && status.roles.pdf) || (hasImage && status.roles.image) || null
  if (!modelId || modelId === status.roles.chat) return null
  const label = status.models[modelId]?.label ?? modelId
  return (
    <div className="small" role="status">
      {t('ai_billing_attachment_model', { model: label, price: describeModel(t, status, modelId) })}
    </div>
  )
}
