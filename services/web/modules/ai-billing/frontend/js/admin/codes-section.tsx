/**
 * Generates redeem codes for the shop, shows them once, and lists batches.
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJSON, getUserFacingMessage, postJSON } from '@/infrastructure/fetch-json'
import Notification from '@/shared/components/notification'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import OLFormText from '@/shared/components/ol/ol-form-text'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import { formatDateTime, formatYuan } from '../format'

type Batch = {
  id: string
  kind: 'vip_days' | 'balance'
  value: number
  count: number
  expiresAt: string | null
  note: string
  createdAt: string
  unused: number
  used: number
  void: number
}

type Generated = { batch: Batch; codes: string[]; links: string[] }

function download(name: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export default function CodesSection() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Batch['kind']>('vip_days')
  const [amount, setAmount] = useState('30')
  const [count, setCount] = useState('10')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Generated | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])

  const load = useCallback(() => {
    getJSON<{ batches: Batch[] }>('/admin/ai-billing/batches')
      .then(data => setBatches(data.batches))
      .catch(err => setError(getUserFacingMessage(err) ?? t('ai_billing_failed')))
  }, [t])

  useEffect(load, [load])

  const describe = (batch: Pick<Batch, 'kind' | 'value'>) =>
    batch.kind === 'vip_days'
      ? t('ai_billing_code_kind_vip', { days: batch.value })
      : t('ai_billing_code_kind_balance', { amount: formatYuan(batch.value) })

  const generate = async () => {
    setBusy(true)
    setError(null)
    setGenerated(null)
    try {
      const result = await postJSON<Generated>('/admin/ai-billing/batches', {
        body: { kind, amount, count, expiresInDays, note },
      })
      setGenerated(result)
      load()
    } catch (err) {
      setError(getUserFacingMessage(err as Error) ?? t('ai_billing_failed'))
    } finally {
      setBusy(false)
    }
  }

  const voidBatch = async (batch: Batch) => {
    if (!window.confirm(t('ai_billing_void_confirm', { count: batch.unused }))) return
    try {
      await postJSON(`/admin/ai-billing/batches/${batch.id}/void`)
      load()
    } catch (err) {
      setError(getUserFacingMessage(err as Error) ?? t('ai_billing_failed'))
    }
  }

  const fileName = (what: string) =>
    `ai-${generated!.batch.kind === 'vip_days' ? `vip-${generated!.batch.value}d` : `balance-${generated!.batch.value / 1000000}`}-${what}-${generated!.batch.id}.txt`

  return (
    <>
      <OLPageContentCard className="mb-3">
        <p className="small">{t('ai_billing_codes_help')}</p>
        <div className="d-flex flex-wrap gap-3">
          <OLFormGroup controlId="ai-billing-code-kind">
            <OLFormLabel>{t('ai_billing_code_kind')}</OLFormLabel>
            <OLFormSelect value={kind} onChange={event => setKind(event.target.value as Batch['kind'])}>
              <option value="vip_days">{t('ai_billing_code_kind_vip_days')}</option>
              <option value="balance">{t('ai_billing_code_kind_balance_yuan')}</option>
            </OLFormSelect>
          </OLFormGroup>
          <OLFormGroup controlId="ai-billing-code-amount" style={{ width: '10rem' }}>
            <OLFormLabel>{kind === 'vip_days' ? t('ai_billing_days') : t('ai_billing_yuan')}</OLFormLabel>
            <OLFormControl inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
          </OLFormGroup>
          <OLFormGroup controlId="ai-billing-code-count" style={{ width: '10rem' }}>
            <OLFormLabel>{t('ai_billing_code_count')}</OLFormLabel>
            <OLFormControl inputMode="numeric" value={count} onChange={event => setCount(event.target.value)} />
          </OLFormGroup>
          <OLFormGroup controlId="ai-billing-code-expiry" style={{ width: '12rem' }}>
            <OLFormLabel>{t('ai_billing_code_expires_in_days')}</OLFormLabel>
            <OLFormControl
              inputMode="numeric"
              placeholder={t('ai_billing_never')}
              value={expiresInDays}
              onChange={event => setExpiresInDays(event.target.value)}
            />
          </OLFormGroup>
        </div>
        <OLFormGroup controlId="ai-billing-code-note">
          <OLFormLabel>{t('ai_billing_note')}</OLFormLabel>
          <OLFormControl value={note} maxLength={200} onChange={event => setNote(event.target.value)} />
        </OLFormGroup>
        <OLButton variant="primary" onClick={generate} isLoading={busy} disabled={busy}>
          {t('ai_billing_generate_codes')}
        </OLButton>
      </OLPageContentCard>

      {error && <Notification type="error" className="mb-3" content={error} />}

      {generated && (
        <OLPageContentCard className="mb-3">
          <Notification type="warning" className="mb-2" content={t('ai_billing_codes_shown_once')} />
          <p>
            {describe(generated.batch)} × {generated.codes.length}
          </p>
          <OLFormGroup controlId="ai-billing-links">
            <OLFormLabel>{t('ai_billing_redeem_links')}</OLFormLabel>
            <OLFormControl as="textarea" rows={6} readOnly value={generated.links.join('\n')} />
            <OLFormText>{t('ai_billing_redeem_links_help')}</OLFormText>
          </OLFormGroup>
          <div className="d-flex flex-wrap gap-2">
            <OLButton variant="primary" leadingIcon="download" onClick={() => download(fileName('links'), generated.links)}>
              {t('ai_billing_download_links')}
            </OLButton>
            <OLButton variant="secondary" leadingIcon="download" onClick={() => download(fileName('codes'), generated.codes)}>
              {t('ai_billing_download_codes')}
            </OLButton>
          </div>
        </OLPageContentCard>
      )}

      <h2 className="h3">{t('ai_billing_batches')}</h2>
      <OLPageContentCard className="mb-5">
        {batches.length === 0 ? (
          <p>{t('ai_billing_no_batches')}</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th scope="col">{t('ai_billing_time')}</th>
                  <th scope="col">{t('ai_billing_what')}</th>
                  <th scope="col">{t('ai_billing_note')}</th>
                  <th scope="col" className="text-end">
                    {t('ai_billing_codes_unused_used_void')}
                  </th>
                  <th scope="col">{t('ai_billing_expires')}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr key={batch.id}>
                    <td className="text-nowrap">{formatDateTime(batch.createdAt)}</td>
                    <td>{describe(batch)}</td>
                    <td>{batch.note}</td>
                    <td className="text-end text-nowrap">
                      {batch.unused} / {batch.used} / {batch.void}
                    </td>
                    <td className="text-nowrap">{batch.expiresAt ? formatDateTime(batch.expiresAt) : t('ai_billing_never')}</td>
                    <td className="text-end">
                      {batch.unused > 0 && (
                        <OLButton variant="danger-ghost" size="sm" onClick={() => voidBatch(batch)}>
                          {t('ai_billing_void_unused')}
                        </OLButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OLPageContentCard>
    </>
  )
}
