export type Role = 'chat' | 'image' | 'pdf' | 'errorAssistant'

export type Model = {
  id: string
  model: string
  label: string
  selectable: boolean
  /** Reasoning efforts users can pick; empty for models without them */
  efforts: string[]
}

export type Provider = {
  id: string
  name: string
  baseURL: string
  /** A new key; blank keeps the saved one */
  apiKey: string
  apiKeyHint: string
  hasApiKey: boolean
  models: Model[]
}

export type AdminConfig = {
  source: 'admin' | 'env'
  enabled: boolean
  roles: Record<Role, string | null>
  providers: Omit<Provider, 'apiKey'>[]
  cipherConfigured: boolean
  updatedAt: string | null
}

export type TestResult =
  | { state: 'running' }
  | { state: 'ok'; text: string; ms: number }
  | { state: 'error'; message: string }
