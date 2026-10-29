export type Billing = 'free_quota' | 'metered' | 'disabled'

/** Per million tokens; strings while being typed */
export type RatesForm = {
  input: number | string
  cachedInput: number | string | null
  cacheWrite: number | string | null
  output: number | string
}

export type Tier = { above: number | string; rates: RatesForm; offPeak: RatesForm | null }

export type Schedule = { from: string | null; tiers: Tier[] }

export type Peak = { weekdays: number[]; ranges: { from: string; to: string }[] }

export type Price = { currency: 'CNY' | 'USD'; peak: Peak | null; schedules: Schedule[] }

export type Preset = { vendor: string; source: string; fetchedAt: string; price: Price }

export type ModelRow = {
  modelId: string
  model: string
  label: string
  provider: string
  billing: Billing | null
  price: Price | null
  preset: Preset | null
}

export type AdminView = {
  enabled: boolean
  freeDailyUses: number
  markup: number
  usdToCny: number
  offPeakDates: string[]
  shopUrl: string
  models: ModelRow[]
  orphans: { modelId: string; billing: Billing; price: Price | null }[]
  updatedAt: string | null
}
