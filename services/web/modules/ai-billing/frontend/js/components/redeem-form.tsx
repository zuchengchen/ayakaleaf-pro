/**
 * Redeems a code typed in or brought by a link from the shop.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FetchError, postJSON } from '@/infrastructure/fetch-json'
import Notification from '@/shared/components/notification'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import { refreshBillingStatus } from '../billing-status'
import { formatYuan } from '../format'

type Redeemed = {
  kind: 'vip_days' | 'balance'
  value: number
  balance: number
  vipUntil: string | null
}

export default function RedeemForm({
  initialCode = '',
  onRedeemed,
}: {
  initialCode?: string
  onRedeemed?: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Redeemed | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Written out so the translations are extracted
  const errors: Record<string, string> = {
    code_invalid: t('ai_billing_code_invalid'),
    code_not_found: t('ai_billing_code_invalid'),
    code_used: t('ai_billing_code_used'),
    code_void: t('ai_billing_code_void'),
    code_expired: t('ai_billing_code_expired'),
  }

  const redeem = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await postJSON<Redeemed>('/ai-billing/redeem', { body: { code } })
      setDone(result)
      setCode('')
      refreshBillingStatus()
      onRedeemed?.()
    } catch (err) {
      const status = err instanceof FetchError ? err.response?.status : undefined
      const known = err instanceof FetchError ? errors[err.data?.error] : undefined
      setError(
        known ?? (status === 429 ? t('ai_billing_code_too_many_tries') : t('ai_billing_redeem_failed'))
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        if (code.trim()) redeem()
      }}
    >
      <OLFormGroup controlId="ai-redeem-code">
        <OLFormLabel>{t('redeem_code')}</OLFormLabel>
        <div className="d-flex gap-2">
          <OLFormControl
            value={code}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            onChange={event => setCode(event.target.value)}
          />
          <OLButton type="submit" variant="primary" isLoading={busy} disabled={busy || !code.trim()}>
            {t('ai_billing_redeem')}
          </OLButton>
        </div>
      </OLFormGroup>
      {error && <Notification type="error" content={error} />}
      {done && (
        <Notification
          type="success"
          content={
            done.kind === 'vip_days'
              ? t('ai_billing_redeemed_vip_until', {
                  days: done.value,
                  date: done.vipUntil ? new Date(done.vipUntil).toLocaleString() : '',
                })
              : t('ai_billing_redeemed_balance_now', {
                  amount: formatYuan(done.value),
                  balance: formatYuan(done.balance),
                })
          }
        />
      )}
    </form>
  )
}
