/**
 * LOCAL: the edit proposals waiting for the user in a chat, so they can be
 * applied or rejected together, or applied as they come with auto-apply.
 */
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react'
import OLButton from '@/shared/components/ol/ol-button'
import { muted, ruleAbove } from './themed'

type PendingEdit = {
  path: string
  startLine: number
  apply: () => Promise<void>
  reject: () => void
}

type PendingEdits = {
  autoApply: boolean
  edits: Map<string, PendingEdit>
  register: (id: string, edit: PendingEdit) => void
  unregister: (id: string) => void
}

const PendingEditsContext = createContext<PendingEdits | null>(null)

export function usePendingEdits() {
  return useContext(PendingEditsContext)
}

export function PendingEditsProvider({ autoApply, children }: PropsWithChildren<{ autoApply: boolean }>) {
  const [edits, setEdits] = useState(() => new Map<string, PendingEdit>())
  const register = useCallback((id: string, edit: PendingEdit) => {
    setEdits(current => new Map(current).set(id, edit))
  }, [])
  const unregister = useCallback((id: string) => {
    setEdits(current => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])
  const value = useMemo(() => ({ autoApply, edits, register, unregister }), [autoApply, edits, register, unregister])
  return <PendingEditsContext.Provider value={value}>{children}</PendingEditsContext.Provider>
}

/** Apply all and Reject all, once two or more edits are waiting. */
export function PendingEditsBar() {
  const pending = usePendingEdits()
  const [busy, setBusy] = useState(false)
  if (!pending || pending.edits.size < 2) return null
  const edits = [...pending.edits.values()]

  // Bottom up within a file, so an applied edit does not move the lines of
  // the ones still to come
  const applyAll = async () => {
    setBusy(true)
    try {
      const ordered = [...edits].sort((a, b) =>
        a.path === b.path ? b.startLine - a.startLine : a.path.localeCompare(b.path)
      )
      for (const edit of ordered) await edit.apply()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="d-flex align-items-center gap-2 px-2 py-2 small" style={ruleAbove}>
      <span className="flex-grow-1" style={muted}>
        {edits.length} edits to review
      </span>
      <OLButton variant="secondary" size="sm" disabled={busy} onClick={() => edits.forEach(edit => edit.reject())}>
        Reject all
      </OLButton>
      <OLButton variant="primary" size="sm" isLoading={busy} disabled={busy} onClick={applyAll}>
        Apply all
      </OLButton>
    </div>
  )
}
