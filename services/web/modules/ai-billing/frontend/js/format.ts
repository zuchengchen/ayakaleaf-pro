import type { TFunction } from 'i18next'
import { freeLeft, type BillingStatus, type Rates } from './billing-status'

const MICRO = 1000000

/**
 * An amount in millionths of a yuan as yuan: two decimals, or up to six for
 * the small charges of single requests.
 */
export function formatYuan(micro: number, { signed = false } = {}) {
  const yuan = micro / MICRO
  const size = Math.abs(yuan)
  const digits = size !== 0 && size < 0.01 ? 6 : 2
  let text = size.toFixed(digits)
  if (digits === 6) text = text.replace(/0+$/, '')
  const sign = yuan < 0 ? '-' : signed && yuan > 0 ? '+' : ''
  return `${sign}¥${text}`
}

/** "¥2/¥8 per 1M tokens", and whether it is the peak or off-peak price. */
export function formatRates(t: TFunction, rates: Rates) {
  const price = t('ai_billing_price_per_million', {
    input: `¥${rates.input}`,
    output: `¥${rates.output}`,
  })
  if (rates.period === 'peak') return `${price} (${t('ai_billing_peak')})`
  if (rates.period === 'offPeak') return `${price} (${t('ai_billing_off_peak')})`
  return price
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * How a model is paid for, for the chat's model menu: free uses left, VIP,
 * or its price; '' while billing is off.
 */
export function describeModel(t: TFunction, status: BillingStatus | null, modelId: string | undefined) {
  if (!status?.enabled || !modelId) return ''
  const model = status.models[modelId]
  if (!model) return t('ai_billing_not_available')
  if (model.billing === 'free_quota') {
    if (status.vip) return t('ai_billing_vip_unlimited')
    const left = freeLeft(status)
    if (left > 0) return t('ai_billing_free_left', { left, limit: status.free.limit })
  }
  return model.rates ? formatRates(t, model.rates) : t('ai_billing_free_used_up')
}
