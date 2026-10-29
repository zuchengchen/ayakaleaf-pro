/**
 * Where a redeem link from the shop lands: the code is filled in, and the
 * user confirms it goes to the account they are logged in with.
 */
import { useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import OLCol from '@/shared/components/ol/ol-col'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import OLRow from '@/shared/components/ol/ol-row'
import RedeemForm from './components/redeem-form'

export default function RedeemPage() {
  const { t } = useTranslation()
  const code = new URLSearchParams(window.location.search).get('code') ?? ''
  const email = getMeta('ol-usersEmail')
  return (
    <div className="container">
      <OLRow>
        <OLCol lg={{ span: 6, offset: 3 }}>
          <h1>{t('redeem_code')}</h1>
          <OLPageContentCard className="mb-3">
            {email && <p>{t('ai_billing_redeem_to', { email })}</p>}
            <RedeemForm initialCode={code} />
            <p className="mb-0 small">
              <a href="/ai/account">{t('ai_account')}</a>
            </p>
          </OLPageContentCard>
        </OLCol>
      </OLRow>
    </div>
  )
}
