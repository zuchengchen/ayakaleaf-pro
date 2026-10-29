/**
 * A user's AI uses, redeemed codes and changes by admins, newest first.
 */
import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { getJSON } from '@/infrastructure/fetch-json'
import { debugConsole } from '@/utils/debugging'
import OLButton from '@/shared/components/ol/ol-button'
import { formatDateTime, formatYuan } from '../format'

export type LedgerEntry = {
  id: string
  type: 'usage' | 'redeem' | 'adjust'
  amount: number
  mode?: 'free' | 'vip' | 'paid' | 'unpriced'
  feature?: 'chat' | 'compaction' | 'errorAssistant'
  model?: string
  tokens?: { input: number; cacheRead: number; cacheWrite: number; output: number }
  price?: { from: string | null; above: number; period: 'peak' | 'offPeak' | null }
  vipDays?: number
  vipUntil?: string | null
  note?: string
  createdAt: string
}

function describe(t: TFunction, entry: LedgerEntry) {
  if (entry.type === 'redeem') {
    return entry.vipDays
      ? t('ai_billing_entry_redeem_vip', { days: entry.vipDays })
      : t('ai_billing_entry_redeem_balance')
  }
  if (entry.type === 'adjust') {
    const what = [
      entry.vipDays ? t('ai_billing_entry_vip_days', { days: entry.vipDays }) : null,
      entry.vipUntil !== undefined && !entry.vipDays
        ? entry.vipUntil
          ? t('ai_billing_entry_vip_until', { date: new Date(entry.vipUntil).toLocaleString() })
          : t('ai_billing_entry_vip_ended')
        : null,
      entry.note || null,
    ].filter(Boolean)
    return [t('ai_billing_entry_adjust'), ...what].join(' · ')
  }
  const feature = {
    chat: t('ai_billing_feature_chat'),
    compaction: t('ai_billing_feature_compaction'),
    errorAssistant: t('ai_billing_feature_fix'),
  }[entry.feature ?? 'chat']
  const mode = {
    free: t('ai_billing_mode_free'),
    vip: t('ai_billing_mode_vip'),
    paid:
      entry.price?.period === 'peak'
        ? t('ai_billing_peak')
        : entry.price?.period === 'offPeak'
          ? t('ai_billing_off_peak')
          : null,
    unpriced: null,
  }[entry.mode ?? 'paid']
  const tier = entry.price?.above ? t('ai_billing_entry_long_context', { tokens: entry.price.above }) : null
  return [feature, entry.model, mode, tier].filter(Boolean).join(' · ')
}

export default function LedgerTable({
  entries,
  more,
  loading,
  onMore,
}: {
  entries: LedgerEntry[]
  more: boolean
  loading: boolean
  onMore: () => void
}) {
  const { t } = useTranslation()
  if (!entries.length && !loading) return <p>{t('ai_billing_no_entries')}</p>
  return (
    <>
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              <th scope="col">{t('ai_billing_time')}</th>
              <th scope="col">{t('ai_billing_what')}</th>
              <th scope="col" className="text-end">
                {t('ai_billing_tokens')}
              </th>
              <th scope="col" className="text-end">
                {t('ai_billing_amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td className="text-nowrap">{formatDateTime(entry.createdAt)}</td>
                <td>{describe(t, entry)}</td>
                <td className="text-end text-nowrap">
                  {entry.tokens ? `${entry.tokens.input} / ${entry.tokens.output}` : ''}
                </td>
                <td className="text-end text-nowrap">
                  {entry.amount ? formatYuan(entry.amount, { signed: true }) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <OLButton variant="secondary" size="sm" isLoading={loading} disabled={loading} onClick={onMore}>
          {t('ai_billing_load_more')}
        </OLButton>
      )}
    </>
  )
}

/**
 * The ledger behind a URL that takes ?before= for older pages; null until
 * there is one to load.
 */
export function useLedger(url: string | null) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (before?: string) => {
      if (!url) return
      setLoading(true)
      try {
        const query = before ? `?before=${encodeURIComponent(before)}` : ''
        const page = await getJSON<{ entries: LedgerEntry[]; more: boolean }>(`${url}${query}`)
        setEntries(current => (before ? [...current, ...page.entries] : page.entries))
        setMore(page.more)
      } catch (error) {
        debugConsole.error(error)
      } finally {
        setLoading(false)
      }
    },
    [url]
  )

  useEffect(() => {
    setEntries([])
    load()
  }, [load])

  return {
    entries,
    more,
    loading,
    reload: () => load(),
    loadMore: () => load(entries.at(-1)?.createdAt),
  }
}
