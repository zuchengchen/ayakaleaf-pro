/**
 * Edits a model's price: currency, optional peak hours, and dated sets of
 * rates, each with tiers by input tokens and, with peak hours, off-peak
 * rates. The server checks it on save.
 */
import { useTranslation } from 'react-i18next'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormCheckbox from '@/shared/components/ol/ol-form-checkbox'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import type { Peak, Price, RatesForm, Schedule, Tier } from './types'

const RATE_FIELDS = ['input', 'cachedInput', 'cacheWrite', 'output'] as const

const emptyRates = (): RatesForm => ({ input: '', cachedInput: null, cacheWrite: null, output: '' })

export const emptyPrice = (): Price => ({
  currency: 'CNY',
  peak: null,
  schedules: [{ from: null, tiers: [{ above: 0, rates: emptyRates(), offPeak: null }] }],
})

const DEFAULT_PEAK: Peak = {
  weekdays: [1, 2, 3, 4, 5],
  ranges: [{ from: '09:00', to: '18:00' }],
}

/** "09:00-12:00, 14:00-18:00" */
function rangesText(peak: Peak) {
  return peak.ranges.map(range => `${range.from}-${range.to}`).join(', ')
}

function parseRanges(text: string) {
  return text
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [from = '', to = ''] = part.split('-').map(time => time.trim())
      return { from, to }
    })
}

function weekdayName(day: number) {
  // 2026-11-01 is a Sunday
  return new Date(Date.UTC(2026, 10, 1 + day)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

function RatesInputs({
  idPrefix,
  rates,
  onChange,
}: {
  idPrefix: string
  rates: RatesForm
  onChange: (rates: RatesForm) => void
}) {
  const { t } = useTranslation()
  const labels = {
    input: t('ai_billing_rate_input'),
    cachedInput: t('ai_billing_rate_cached_input'),
    cacheWrite: t('ai_billing_rate_cache_write'),
    output: t('ai_billing_rate_output'),
  }
  return (
    <div className="d-flex flex-wrap gap-2">
      {RATE_FIELDS.map(field => (
        <div key={field} style={{ width: '9rem' }}>
          <OLFormLabel htmlFor={`${idPrefix}-${field}`} className="small mb-0">
            {labels[field]}
          </OLFormLabel>
          <OLFormControl
            id={`${idPrefix}-${field}`}
            size="sm"
            inputMode="decimal"
            value={rates[field] ?? ''}
            placeholder={field === 'cachedInput' || field === 'cacheWrite' ? t('ai_billing_same_as_input') : ''}
            onChange={event => {
              const value = event.target.value
              onChange({
                ...rates,
                [field]: value === '' && (field === 'cachedInput' || field === 'cacheWrite') ? null : value,
              })
            }}
          />
        </div>
      ))}
    </div>
  )
}

export default function PriceEditor({
  id,
  price,
  onChange,
}: {
  id: string
  price: Price
  onChange: (price: Price) => void
}) {
  const { t } = useTranslation()

  const setSchedule = (index: number, schedule: Schedule) =>
    onChange({ ...price, schedules: price.schedules.map((other, i) => (i === index ? schedule : other)) })

  const setTier = (scheduleIndex: number, tierIndex: number, tier: Tier) => {
    const schedule = price.schedules[scheduleIndex]
    setSchedule(scheduleIndex, {
      ...schedule,
      tiers: schedule.tiers.map((other, i) => (i === tierIndex ? tier : other)),
    })
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap gap-3 align-items-end">
        <div>
          <OLFormLabel htmlFor={`${id}-currency`} className="small mb-0">
            {t('ai_billing_currency')}
          </OLFormLabel>
          <OLFormSelect
            id={`${id}-currency`}
            size="sm"
            value={price.currency}
            onChange={event => onChange({ ...price, currency: event.target.value as Price['currency'] })}
          >
            <option value="CNY">CNY ¥</option>
            <option value="USD">USD $</option>
          </OLFormSelect>
        </div>
        <OLFormCheckbox
          id={`${id}-peak`}
          label={t('ai_billing_peak_rates')}
          checked={Boolean(price.peak)}
          onChange={event => onChange({ ...price, peak: event.target.checked ? DEFAULT_PEAK : null })}
        />
      </div>

      {price.peak && (
        <div className="d-flex flex-column gap-2">
          <div className="d-flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5, 6, 0].map(day => (
              <OLFormCheckbox
                key={day}
                id={`${id}-day-${day}`}
                label={weekdayName(day)}
                checked={price.peak!.weekdays.includes(day)}
                onChange={event =>
                  onChange({
                    ...price,
                    peak: {
                      ...price.peak!,
                      weekdays: event.target.checked
                        ? [...price.peak!.weekdays, day]
                        : price.peak!.weekdays.filter(other => other !== day),
                    },
                  })
                }
              />
            ))}
          </div>
          <div style={{ maxWidth: '24rem' }}>
            <OLFormLabel htmlFor={`${id}-ranges`} className="small mb-0">
              {t('ai_billing_peak_hours')}
            </OLFormLabel>
            <OLFormControl
              id={`${id}-ranges`}
              size="sm"
              defaultValue={rangesText(price.peak)}
              placeholder="09:00-12:00, 14:00-18:00"
              onBlur={event => onChange({ ...price, peak: { ...price.peak!, ranges: parseRanges(event.target.value) } })}
            />
            <div className="small text-muted">{t('ai_billing_peak_hours_help')}</div>
          </div>
        </div>
      )}

      {price.schedules.map((schedule, scheduleIndex) => (
        <div key={scheduleIndex} className="border rounded p-2 d-flex flex-column gap-2">
          <div className="d-flex align-items-end gap-2">
            {scheduleIndex === 0 ? (
              <strong className="small">{t('ai_billing_rates_from_start')}</strong>
            ) : (
              <>
                <div>
                  <OLFormLabel htmlFor={`${id}-from-${scheduleIndex}`} className="small mb-0">
                    {t('ai_billing_rates_from')}
                  </OLFormLabel>
                  <OLFormControl
                    id={`${id}-from-${scheduleIndex}`}
                    size="sm"
                    type="date"
                    value={schedule.from ?? ''}
                    onChange={event => setSchedule(scheduleIndex, { ...schedule, from: event.target.value })}
                  />
                </div>
                <OLButton
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({ ...price, schedules: price.schedules.filter((_, i) => i !== scheduleIndex) })
                  }
                >
                  {t('ai_billing_remove')}
                </OLButton>
              </>
            )}
          </div>
          {schedule.tiers.map((tier, tierIndex) => (
            <div key={tierIndex} className="d-flex flex-column gap-1 ps-2 border-start">
              <div className="d-flex align-items-end gap-2">
                {tierIndex === 0 ? (
                  <span className="small">{t('ai_billing_tier_all')}</span>
                ) : (
                  <>
                    <div style={{ width: '12rem' }}>
                      <OLFormLabel htmlFor={`${id}-above-${scheduleIndex}-${tierIndex}`} className="small mb-0">
                        {t('ai_billing_tier_above')}
                      </OLFormLabel>
                      <OLFormControl
                        id={`${id}-above-${scheduleIndex}-${tierIndex}`}
                        size="sm"
                        inputMode="numeric"
                        value={tier.above}
                        onChange={event =>
                          setTier(scheduleIndex, tierIndex, { ...tier, above: event.target.value })
                        }
                      />
                    </div>
                    <OLButton
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSchedule(scheduleIndex, {
                          ...schedule,
                          tiers: schedule.tiers.filter((_, i) => i !== tierIndex),
                        })
                      }
                    >
                      {t('ai_billing_remove')}
                    </OLButton>
                  </>
                )}
              </div>
              {price.peak && <span className="small text-muted">{t('ai_billing_peak')}</span>}
              <RatesInputs
                idPrefix={`${id}-rates-${scheduleIndex}-${tierIndex}`}
                rates={tier.rates}
                onChange={rates => setTier(scheduleIndex, tierIndex, { ...tier, rates })}
              />
              {price.peak && (
                <>
                  <span className="small text-muted">{t('ai_billing_off_peak')}</span>
                  <RatesInputs
                    idPrefix={`${id}-offpeak-${scheduleIndex}-${tierIndex}`}
                    rates={tier.offPeak ?? tier.rates}
                    onChange={offPeak => setTier(scheduleIndex, tierIndex, { ...tier, offPeak })}
                  />
                </>
              )}
            </div>
          ))}
          <div>
            <OLButton
              variant="secondary"
              size="sm"
              leadingIcon="add"
              onClick={() =>
                setSchedule(scheduleIndex, {
                  ...schedule,
                  tiers: [...schedule.tiers, { above: '', rates: emptyRates(), offPeak: null }],
                })
              }
            >
              {t('ai_billing_add_tier')}
            </OLButton>
          </div>
        </div>
      ))}
      <div>
        <OLButton
          variant="secondary"
          size="sm"
          leadingIcon="add"
          onClick={() =>
            onChange({
              ...price,
              schedules: [...price.schedules, { from: '', tiers: [{ above: 0, rates: emptyRates(), offPeak: null }] }],
            })
          }
        >
          {t('ai_billing_add_dated_rates')}
        </OLButton>
      </div>
      <div className="small text-muted">{t('ai_billing_price_help')}</div>
    </div>
  )
}
