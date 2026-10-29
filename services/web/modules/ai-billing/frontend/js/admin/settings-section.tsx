/**
 * Billing settings and how each model of the AI providers page is paid for.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJSON, getUserFacingMessage, postJSON } from '@/infrastructure/fetch-json'
import Notification from '@/shared/components/notification'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormCheckbox from '@/shared/components/ol/ol-form-checkbox'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import OLFormText from '@/shared/components/ol/ol-form-text'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import PriceEditor, { emptyPrice } from './price-editor'
import type { AdminView, Billing, ModelRow, Price } from './types'

type Form = {
  enabled: boolean
  freeDailyUses: string
  markup: string
  usdToCny: string
  offPeakDates: string
  shopUrl: string
  models: ModelRow[]
}

function toForm(view: AdminView): Form {
  return {
    enabled: view.enabled,
    freeDailyUses: String(view.freeDailyUses),
    markup: String(view.markup),
    usdToCny: String(view.usdToCny),
    offPeakDates: view.offPeakDates.join('\n'),
    shopUrl: view.shopUrl,
    models: view.models,
  }
}

function summary(t: (key: string, options?: any) => string, price: Price | null) {
  if (!price) return t('ai_billing_no_price')
  const rates = price.schedules[0].tiers[0].rates
  const symbol = price.currency === 'USD' ? '$' : '¥'
  const rules = [
    price.peak && t('ai_billing_peak_rates'),
    price.schedules[0].tiers.length > 1 && t('ai_billing_long_context_tiers'),
    price.schedules.length > 1 && t('ai_billing_dated_rates'),
  ].filter(Boolean)
  const base = t('ai_billing_price_per_million', {
    input: `${symbol}${rates.input}`,
    output: `${symbol}${rates.output}`,
  })
  return rules.length ? `${base} · ${rules.join(' · ')}` : base
}

function ModelPriceRow({ row, onChange }: { row: ModelRow; onChange: (row: ModelRow) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const id = `ai-billing-model-${row.modelId}`
  return (
    <div className="border-bottom py-2">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <div className="flex-grow-1" style={{ minWidth: '14rem' }}>
          <strong>{row.label}</strong>{' '}
          <span className="small text-muted">
            {row.provider} · <code>{row.model}</code>
          </span>
          <div className="small">{summary(t, row.price)}</div>
        </div>
        <OLFormSelect
          id={`${id}-billing`}
          size="sm"
          style={{ width: 'auto' }}
          aria-label={t('ai_billing_how_paid')}
          value={row.billing ?? ''}
          onChange={event => onChange({ ...row, billing: (event.target.value || null) as Billing | null })}
        >
          <option value="">{t('ai_billing_type_unset')}</option>
          <option value="free_quota">{t('ai_billing_type_free_quota')}</option>
          <option value="metered">{t('ai_billing_type_metered')}</option>
          <option value="disabled">{t('ai_billing_type_disabled')}</option>
        </OLFormSelect>
        <OLButton variant="secondary" size="sm" onClick={() => setOpen(!open)}>
          {open ? t('ai_billing_close') : t('ai_billing_edit_price')}
        </OLButton>
      </div>
      {open && (
        <div className="mt-2 d-flex flex-column gap-2">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {row.preset && (
              <>
                <OLButton
                  variant="secondary"
                  size="sm"
                  onClick={() => onChange({ ...row, price: structuredClone(row.preset!.price) })}
                >
                  {t('ai_billing_use_official_price')}
                </OLButton>
                <span className="small text-muted">
                  {t('ai_billing_official_price_from', { date: row.preset.fetchedAt })}{' '}
                  <a href={row.preset.source} target="_blank" rel="noopener noreferrer">
                    {row.preset.vendor}
                  </a>
                </span>
              </>
            )}
            {!row.price && (
              <OLButton variant="secondary" size="sm" onClick={() => onChange({ ...row, price: emptyPrice() })}>
                {t('ai_billing_enter_price')}
              </OLButton>
            )}
            {row.price && (
              <OLButton variant="danger-ghost" size="sm" onClick={() => onChange({ ...row, price: null })}>
                {t('ai_billing_remove_price')}
              </OLButton>
            )}
          </div>
          {row.price && <PriceEditor id={id} price={row.price} onChange={price => onChange({ ...row, price })} />}
        </div>
      )}
    </div>
  )
}

export default function SettingsSection() {
  const { t } = useTranslation()
  const [view, setView] = useState<AdminView | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loaded = (next: AdminView) => {
    setView(next)
    setForm(toForm(next))
  }

  useEffect(() => {
    getJSON<AdminView>('/admin/ai-billing/settings')
      .then(loaded)
      .catch(error => setMessage({ type: 'error', text: getUserFacingMessage(error) ?? t('ai_billing_failed') }))
  }, [t])

  if (!form || !view) {
    return message ? <Notification type="error" content={message.text} /> : <OLSpinner size="sm" />
  }

  const update = (change: Partial<Form>) => {
    setMessage(null)
    setForm({ ...form, ...change })
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const next = await postJSON<AdminView>('/admin/ai-billing/settings', {
        body: {
          enabled: form.enabled,
          freeDailyUses: form.freeDailyUses,
          markup: form.markup,
          usdToCny: form.usdToCny,
          offPeakDates: form.offPeakDates.split(/[\s,]+/).filter(Boolean),
          shopUrl: form.shopUrl,
          models: [
            ...form.models
              .filter(row => row.billing)
              .map(row => ({ modelId: row.modelId, billing: row.billing, price: row.price })),
            // Prices of models removed from the AI providers page stay
            ...view.orphans,
          ],
        },
      })
      loaded(next)
      setMessage({ type: 'success', text: t('ai_billing_saved') })
    } catch (error) {
      setMessage({ type: 'error', text: getUserFacingMessage(error as Error) ?? t('ai_billing_failed') })
    } finally {
      setSaving(false)
    }
  }

  const unset = form.models.filter(row => !row.billing).length

  return (
    <>
      <OLPageContentCard className="mb-3">
        <OLFormCheckbox
          id="ai-billing-enabled"
          type="switch"
          label={t('ai_billing_enable')}
          checked={form.enabled}
          onChange={event => update({ enabled: event.target.checked })}
        />
        <OLFormText>{t('ai_billing_enable_help')}</OLFormText>
        {form.enabled && unset > 0 && (
          <Notification type="warning" className="mt-2" content={t('ai_billing_unset_models', { count: unset })} />
        )}
      </OLPageContentCard>

      <OLPageContentCard className="mb-3">
        <div className="d-flex flex-wrap gap-3">
          <OLFormGroup controlId="ai-billing-free" style={{ width: '12rem' }}>
            <OLFormLabel>{t('ai_billing_free_uses_a_day')}</OLFormLabel>
            <OLFormControl
              inputMode="numeric"
              value={form.freeDailyUses}
              onChange={event => update({ freeDailyUses: event.target.value })}
            />
          </OLFormGroup>
          <OLFormGroup controlId="ai-billing-markup" style={{ width: '12rem' }}>
            <OLFormLabel>{t('ai_billing_markup')}</OLFormLabel>
            <OLFormControl
              inputMode="decimal"
              value={form.markup}
              onChange={event => update({ markup: event.target.value })}
            />
          </OLFormGroup>
          <OLFormGroup controlId="ai-billing-usd" style={{ width: '12rem' }}>
            <OLFormLabel>{t('ai_billing_usd_to_cny')}</OLFormLabel>
            <OLFormControl
              inputMode="decimal"
              value={form.usdToCny}
              onChange={event => update({ usdToCny: event.target.value })}
            />
          </OLFormGroup>
        </div>
        <OLFormText>{t('ai_billing_numbers_help')}</OLFormText>
        <OLFormGroup controlId="ai-billing-shop" className="mt-3">
          <OLFormLabel>{t('ai_billing_shop_url')}</OLFormLabel>
          <OLFormControl
            type="url"
            placeholder="https://catfk.com/shop/…"
            value={form.shopUrl}
            onChange={event => update({ shopUrl: event.target.value })}
          />
          <OLFormText>{t('ai_billing_shop_url_help')}</OLFormText>
        </OLFormGroup>
        <OLFormGroup controlId="ai-billing-off-peak">
          <OLFormLabel>{t('ai_billing_off_peak_dates')}</OLFormLabel>
          <OLFormControl
            as="textarea"
            rows={4}
            placeholder={'2026-10-01\n2026-10-02'}
            value={form.offPeakDates}
            onChange={event => update({ offPeakDates: event.target.value })}
          />
          <OLFormText>{t('ai_billing_off_peak_dates_help')}</OLFormText>
        </OLFormGroup>
      </OLPageContentCard>

      <h2 className="h3">{t('ai_billing_model_prices')}</h2>
      <OLPageContentCard className="mb-3">
        <p className="small">{t('ai_billing_model_prices_help')}</p>
        {form.models.length === 0 && <p>{t('ai_billing_no_models')}</p>}
        {form.models.map((row, index) => (
          <ModelPriceRow
            key={row.modelId}
            row={row}
            onChange={next => update({ models: form.models.map((other, i) => (i === index ? next : other)) })}
          />
        ))}
      </OLPageContentCard>

      {message && <Notification type={message.type} className="mb-3" content={message.text} />}
      <OLButton variant="primary" className="mb-5" onClick={save} isLoading={saving} disabled={saving}>
        {t('ai_billing_save')}
      </OLButton>
    </>
  )
}
