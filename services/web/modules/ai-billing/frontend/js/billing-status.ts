/**
 * The user's AI billing status from /ai-billing/status, shared by the chat,
 * the error assistant and the account page, and fetched again whenever
 * something may have changed it.
 */
import { useEffect, useState } from 'react'
import { getJSON } from '@/infrastructure/fetch-json'

export type Rates = {
  /** Yuan per million tokens */
  input: number
  cachedInput: number | null
  output: number
  period: 'peak' | 'offPeak' | null
}

export type ModelBilling = {
  label: string
  billing: 'free_quota' | 'metered'
  rates: Rates | null
}

export type Roles = {
  chat: string | null
  image: string | null
  pdf: string | null
  errorAssistant: string | null
}

export type BillingStatus =
  | { enabled: false; roles: Roles }
  | {
      enabled: true
      shopUrl: string
      /** Millionths of a yuan */
      balance: number
      vipUntil: string | null
      vip: boolean
      free: { limit: number; used: number; resetsAt: string }
      models: Record<string, ModelBilling>
      roles: Roles
    }

const CHANGED = 'ai-billing:changed'

let status: Promise<BillingStatus | null> | undefined

function load() {
  status ??= getJSON<BillingStatus>('/ai-billing/status').catch(() => {
    status = undefined
    return null
  })
  return status
}

/** Fetches the status again, after a request that may have used or charged. */
export function refreshBillingStatus() {
  status = undefined
  window.dispatchEvent(new Event(CHANGED))
}

/** The status, or null while it loads or if it could not be fetched. */
export function useBillingStatus() {
  const [value, setValue] = useState<BillingStatus | null>(null)
  useEffect(() => {
    let active = true
    const update = () =>
      load().then(next => {
        if (active) setValue(next)
      })
    update()
    window.addEventListener(CHANGED, update)
    return () => {
      active = false
      window.removeEventListener(CHANGED, update)
    }
  }, [])
  return value
}

/** Free uses left today. */
export function freeLeft(value: Extract<BillingStatus, { enabled: true }>) {
  return Math.max(0, value.free.limit - value.free.used)
}
