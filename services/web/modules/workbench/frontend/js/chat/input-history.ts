/**
 * LOCAL: what the user sent before, newest last, kept in the browser so ↑
 * and ↓ in the composer bring it back like a shell does.
 */
import customLocalStorage from '@/infrastructure/local-storage'

const KEY = 'workbench.input-history'
const MAX_ENTRIES = 50

export function readInputHistory(): string[] {
  const stored = customLocalStorage.getItem(KEY)
  return Array.isArray(stored) ? stored.filter(entry => typeof entry === 'string') : []
}

export function rememberInput(text: string) {
  const entry = text.trim()
  if (!entry) return
  const history = readInputHistory().filter(other => other !== entry)
  history.push(entry)
  customLocalStorage.setItem(KEY, history.slice(-MAX_ENTRIES))
}
