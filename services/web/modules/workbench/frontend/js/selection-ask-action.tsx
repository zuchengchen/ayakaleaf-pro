/**
 * LOCAL: an "Ask AI" button below selected text
 * (overleafModuleImports.sourceEditorComponents). It opens a box to say how
 * to change the selection; the request goes to the assistant's chat with the
 * selected lines.
 */
import { useEffect, useReducer, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import MaterialIcon from '@/shared/components/material-icon'
import {
  useCodeMirrorStateContext,
  useCodeMirrorViewContext,
} from '@/features/source-editor/components/codemirror-context'
import useAiAccess from './hooks/use-ai-access'
import { useAssistantDock } from './assistant-dock-context'
import { askAssistant } from './assistant-events'

const QUICK_ASKS = [
  { label: 'Improve', text: 'Improve the writing of the selected text.' },
  { label: 'Fix grammar', text: 'Fix the grammar and spelling of the selected text.' },
  { label: 'Shorten', text: 'Make the selected text shorter without losing its meaning.' },
  { label: 'Explain', text: 'Explain what the selected LaTeX does.' },
]

// Wait for the selection to settle before offering the button
const SHOW_DELAY_MS = 250

export default function SelectionAskAction() {
  const hasAccess = useAiAccess()
  const state = useCodeMirrorStateContext()
  const view = useCodeMirrorViewContext()
  const { show } = useAssistantDock()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [settled, setSettled] = useState(false)
  // Moves the button along when the editor scrolls or resizes
  const [, reposition] = useReducer((count: number) => count + 1, 0)

  const { from, to, empty } = state.selection.main

  useEffect(() => {
    const down = () => setDragging(true)
    const up = () => setDragging(false)
    view.contentDOM.addEventListener('mousedown', down)
    window.addEventListener('mouseup', up)
    view.scrollDOM.addEventListener('scroll', reposition)
    window.addEventListener('resize', reposition)
    return () => {
      view.contentDOM.removeEventListener('mousedown', down)
      window.removeEventListener('mouseup', up)
      view.scrollDOM.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  }, [view])

  useEffect(() => {
    setSettled(false)
    setOpen(false)
    if (empty) return
    const timer = window.setTimeout(() => setSettled(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [from, to, empty])

  if (!hasAccess || empty || dragging || !settled) return null

  // Below the end of the selection, kept inside the editor
  const end = view.coordsAtPos(to, -1)
  const editor = view.scrollDOM.getBoundingClientRect()
  if (!end || end.bottom < editor.top || end.top > editor.bottom) return null
  const top = Math.min(end.bottom + 6, editor.bottom - 40)
  const left = Math.max(editor.left + 8, Math.min(end.left, editor.right - 340))

  const ask = (request: string) => {
    if (!request.trim()) return
    show()
    askAssistant(request.trim())
    setText('')
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      ask(text)
    } else if (event.key === 'Escape') {
      setOpen(false)
      view.focus()
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', top, left, zIndex: 20 }}>
      {open ? (
        <div
          className="d-flex flex-column gap-2 p-2 rounded shadow"
          style={{
            width: 330,
            backgroundColor: 'var(--bg-primary-themed)',
            border: '1px solid var(--border-divider-themed)',
          }}
          role="dialog"
          aria-label="Ask AI about the selection"
        >
          <textarea
            className="form-control form-control-sm"
            rows={2}
            autoFocus
            placeholder="How should the AI change the selection?"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="d-flex flex-wrap gap-1">
            {QUICK_ASKS.map(quick => (
              <button
                key={quick.label}
                type="button"
                className="btn btn-secondary btn-sm py-0"
                onClick={() => ask(quick.text)}
              >
                {quick.label}
              </button>
            ))}
            <span className="flex-grow-1" />
            <button
              type="button"
              className="btn btn-primary btn-sm py-0"
              disabled={!text.trim()}
              onClick={() => ask(text)}
            >
              Ask
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm d-inline-flex align-items-center gap-1 rounded-pill px-2 py-0 shadow-sm fw-bold"
          style={{ color: 'var(--white)', backgroundColor: 'var(--green-50)' }}
          // Keeps the editor's selection and focus
          onMouseDown={event => event.preventDefault()}
          onClick={() => setOpen(true)}
        >
          <MaterialIcon type="auto_awesome" /> Ask AI
        </button>
      )}
    </div>,
    document.body
  )
}
