/**
 * The user's AI account: balance, VIP membership, today's free uses, a
 * place to redeem codes and the ledger.
 */
import { useTranslation } from 'react-i18next'
import OLCol from '@/shared/components/ol/ol-col'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import OLRow from '@/shared/components/ol/ol-row'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import Notification from '@/shared/components/notification'
import { freeLeft, useBillingStatus } from './billing-status'
import { formatYuan } from './format'
import RedeemForm from './components/redeem-form'
import LedgerTable, { useLedger } from './components/ledger-table'

export default function AccountPage() {
  const { t } = useTranslation()
  const status = useBillingStatus()
  const ledger = useLedger('/ai-billing/ledger')

  return (
    <div className="container">
      <OLRow>
        <OLCol lg={{ span: 10, offset: 1 }}>
          <h1>{t('ai_account')}</h1>
          {!status ? (
            <OLSpinner size="sm" />
          ) : !status.enabled ? (
            <Notification type="info" content={t('ai_billing_off_notice')} />
          ) : (
            <>
              <OLPageContentCard className="mb-3">
                <OLRow>
                  <OLCol md={4} className="mb-2">
                    <div className="small text-muted">{t('ai_billing_balance')}</div>
                    <div className="h3 mb-0">{formatYuan(status.balance)}</div>
                  </OLCol>
                  <OLCol md={4} className="mb-2">
                    <div className="small text-muted">{t('ai_billing_vip')}</div>
                    <div className="h5 mb-0">
                      {status.vip && status.vipUntil
                        ? t('ai_billing_vip_until', { date: new Date(status.vipUntil).toLocaleString() })
                        : t('ai_billing_not_vip')}
                    </div>
                  </OLCol>
                  <OLCol md={4} className="mb-2">
                    <div className="small text-muted">{t('ai_billing_free_uses')}</div>
                    <div className="h5 mb-0">
                      {status.vip
                        ? t('ai_billing_vip_unlimited')
                        : t('ai_billing_free_today', { left: freeLeft(status), limit: status.free.limit })}
                    </div>
                    <div className="small text-muted">{t('ai_billing_free_resets')}</div>
                  </OLCol>
                </OLRow>
                <p className="mb-0 small">{t('ai_billing_how_it_works')}</p>
              </OLPageContentCard>

              <OLPageContentCard className="mb-3">
                <RedeemForm onRedeemed={ledger.reload} />
                {status.shopUrl && (
                  <p className="mb-0 small">
                    <a href={status.shopUrl} target="_blank" rel="noopener noreferrer">
                      {t('ai_billing_buy_codes')}
                    </a>
                  </p>
                )}
              </OLPageContentCard>
            </>
          )}

          <h2 className="h3">{t('ai_billing_history')}</h2>
          <OLPageContentCard className="mb-5">
            <LedgerTable
              entries={ledger.entries}
              more={ledger.more}
              loading={ledger.loading}
              onMore={ledger.loadMore}
            />
          </OLPageContentCard>
        </OLCol>
      </OLRow>
    </div>
  )
}
