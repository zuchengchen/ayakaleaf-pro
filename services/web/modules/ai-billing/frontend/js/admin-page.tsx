/**
 * The admin page for AI billing: settings and model prices, redeem codes,
 * and users' accounts.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import OLCol from '@/shared/components/ol/ol-col'
import OLRow from '@/shared/components/ol/ol-row'
import SettingsSection from './admin/settings-section'
import CodesSection from './admin/codes-section'
import UsersSection from './admin/users-section'

const TABS = ['settings', 'codes', 'users'] as const

export default function AdminPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<(typeof TABS)[number]>('settings')
  const labels = {
    settings: t('ai_billing_tab_settings'),
    codes: t('ai_billing_tab_codes'),
    users: t('ai_billing_tab_users'),
  }
  return (
    <div className="container">
      <OLRow>
        <OLCol lg={{ span: 10, offset: 1 }}>
          <h1>{t('ai_billing')}</h1>
          <ul className="nav nav-tabs mb-3" role="tablist">
            {TABS.map(name => (
              <li className="nav-item" key={name} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  className={`nav-link${tab === name ? ' active' : ''}`}
                  onClick={() => setTab(name)}
                >
                  {labels[name]}
                </button>
              </li>
            ))}
          </ul>
          {tab === 'settings' && <SettingsSection />}
          {tab === 'codes' && <CodesSection />}
          {tab === 'users' && <UsersSection />}
        </OLCol>
      </OLRow>
    </div>
  )
}
