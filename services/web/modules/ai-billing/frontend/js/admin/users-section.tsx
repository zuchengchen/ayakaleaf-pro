/**
 * Finds a user by email and changes their balance or VIP membership.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FetchError, getJSON, getUserFacingMessage, postJSON } from '@/infrastructure/fetch-json'
import Notification from '@/shared/components/notification'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormText from '@/shared/components/ol/ol-form-text'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import { formatYuan } from '../format'
import LedgerTable, { useLedger } from '../components/ledger-table'

type Found = {
  user: { id: string; email: string; name: string }
  balance: number
  vipUntil: string | null
}

export default function UsersSection() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [balanceYuan, setBalanceYuan] = useState('')
  const [vipDays, setVipDays] = useState('')
  const [vipUntil, setVipUntil] = useState('')
  const [note, setNote] = useState('')
  const ledger = useLedger(found ? `/admin/ai-billing/users/${found.user.id}/ledger` : null)

  const failed = (error: unknown) =>
    setMessage({ type: 'error', text: getUserFacingMessage(error as Error) ?? t('ai_billing_failed') })

  const search = async () => {
    setBusy(true)
    setMessage(null)
    try {
      setFound(await getJSON<Found>(`/admin/ai-billing/users?email=${encodeURIComponent(email.trim())}`))
    } catch (error) {
      setFound(null)
      if (error instanceof FetchError && error.response?.status === 404) {
        setMessage({ type: 'error', text: t('ai_billing_user_not_found') })
      } else {
        failed(error)
      }
    } finally {
      setBusy(false)
    }
  }

  const adjust = async (change: Record<string, unknown>) => {
    if (!found) return
    setBusy(true)
    setMessage(null)
    try {
      const next = await postJSON<Found>(`/admin/ai-billing/users/${found.user.id}/adjust`, {
        body: { ...change, note },
      })
      setFound(next)
      setBalanceYuan('')
      setVipDays('')
      setVipUntil('')
      setNote('')
      ledger.reload()
      setMessage({ type: 'success', text: t('ai_billing_saved') })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  const vipActive = found?.vipUntil && new Date(found.vipUntil) > new Date()

  return (
    <>
      <OLPageContentCard className="mb-3">
        <form
          className="d-flex gap-2 align-items-end"
          onSubmit={event => {
            event.preventDefault()
            if (email.trim()) search()
          }}
        >
          <OLFormGroup controlId="ai-billing-user-email" className="flex-grow-1 mb-0">
            <OLFormLabel>{t('ai_billing_email')}</OLFormLabel>
            <OLFormControl type="email" value={email} onChange={event => setEmail(event.target.value)} />
          </OLFormGroup>
          <OLButton type="submit" variant="primary" isLoading={busy} disabled={busy || !email.trim()}>
            {t('ai_billing_find_user')}
          </OLButton>
        </form>
      </OLPageContentCard>

      {message && <Notification type={message.type} className="mb-3" content={message.text} />}

      {found && (
        <>
          <OLPageContentCard className="mb-3">
            <h2 className="h4">
              {found.user.name || found.user.email} <span className="small text-muted">{found.user.email}</span>
            </h2>
            <p>
              {t('ai_billing_balance_is', { amount: formatYuan(found.balance) })} ·{' '}
              {vipActive
                ? t('ai_billing_vip_until', { date: new Date(found.vipUntil!).toLocaleString() })
                : t('ai_billing_not_vip')}
            </p>
            <div className="d-flex flex-wrap gap-3 align-items-end">
              <OLFormGroup controlId="ai-billing-adjust-balance" style={{ width: '12rem' }}>
                <OLFormLabel>{t('ai_billing_add_balance')}</OLFormLabel>
                <OLFormControl
                  inputMode="decimal"
                  placeholder="10 / -5"
                  value={balanceYuan}
                  onChange={event => setBalanceYuan(event.target.value)}
                />
              </OLFormGroup>
              <OLFormGroup controlId="ai-billing-adjust-days" style={{ width: '12rem' }}>
                <OLFormLabel>{t('ai_billing_add_vip_days')}</OLFormLabel>
                <OLFormControl inputMode="numeric" value={vipDays} onChange={event => setVipDays(event.target.value)} />
              </OLFormGroup>
              <OLFormGroup controlId="ai-billing-adjust-note" className="flex-grow-1">
                <OLFormLabel>{t('ai_billing_note')}</OLFormLabel>
                <OLFormControl value={note} maxLength={200} onChange={event => setNote(event.target.value)} />
              </OLFormGroup>
            </div>
            <OLButton
              variant="primary"
              className="mb-3"
              isLoading={busy}
              disabled={busy || (!balanceYuan.trim() && !vipDays.trim())}
              onClick={() =>
                adjust({
                  ...(balanceYuan.trim() && { balanceYuan }),
                  ...(vipDays.trim() && { vipDays }),
                })
              }
            >
              {t('ai_billing_apply')}
            </OLButton>
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <OLFormGroup controlId="ai-billing-adjust-until" className="mb-0">
                <OLFormLabel>{t('ai_billing_set_vip_end')}</OLFormLabel>
                <OLFormControl type="datetime-local" value={vipUntil} onChange={event => setVipUntil(event.target.value)} />
              </OLFormGroup>
              <OLButton
                variant="secondary"
                disabled={busy || !vipUntil}
                onClick={() => adjust({ vipUntil: new Date(vipUntil).toISOString() })}
              >
                {t('ai_billing_set')}
              </OLButton>
              {vipActive && (
                <OLButton variant="danger-ghost" disabled={busy} onClick={() => adjust({ vipUntil: null })}>
                  {t('ai_billing_end_vip_now')}
                </OLButton>
              )}
            </div>
            <OLFormText>{t('ai_billing_adjust_help')}</OLFormText>
          </OLPageContentCard>

          <OLPageContentCard className="mb-5">
            <LedgerTable entries={ledger.entries} more={ledger.more} loading={ledger.loading} onMore={ledger.loadMore} />
          </OLPageContentCard>
        </>
      )}
    </>
  )
}
