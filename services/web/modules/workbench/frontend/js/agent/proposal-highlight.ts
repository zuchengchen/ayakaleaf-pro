/**
 * LOCAL: marks the lines a pending propose_edit would change in the open
 * document, until the user applies or rejects it
 * (overleafModuleImports.sourceEditorExtensions).
 */
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { findEdit, type ProposedEdit } from './apply-edit'

type Highlight = { id: string; from: number; to: number }

const addHighlight = StateEffect.define<Highlight>()
const removeHighlight = StateEffect.define<string>()

const lineMark = Decoration.line({ class: 'ol-ai-proposal-line' })

const highlightField = StateField.define<Highlight[]>({
  create: () => [],
  update(highlights, transaction) {
    let next = transaction.docChanged
      ? highlights.map(highlight => ({
          ...highlight,
          from: transaction.changes.mapPos(highlight.from, -1),
          to: transaction.changes.mapPos(highlight.to, 1),
        }))
      : highlights
    for (const effect of transaction.effects) {
      if (effect.is(addHighlight)) {
        next = [...next.filter(highlight => highlight.id !== effect.value.id), effect.value]
      } else if (effect.is(removeHighlight)) {
        next = next.filter(highlight => highlight.id !== effect.value)
      }
    }
    return next
  },
  provide: field =>
    EditorView.decorations.compute([field], (state): DecorationSet => {
      const starts = new Set<number>()
      for (const { from, to } of state.field(field)) {
        const last = state.doc.lineAt(Math.min(to, state.doc.length)).number
        for (let number = state.doc.lineAt(Math.min(from, state.doc.length)).number; number <= last; number++) {
          starts.add(state.doc.line(number).from)
        }
      }
      return Decoration.set(
        [...starts].sort((a, b) => a - b).map(start => lineMark.range(start))
      )
    }),
})

const theme = EditorView.baseTheme({
  '&light .ol-ai-proposal-line': {
    backgroundColor: 'rgba(255, 193, 7, 0.18)',
    boxShadow: 'inset 3px 0 0 #e0a100',
  },
  '&dark .ol-ai-proposal-line': {
    backgroundColor: 'rgba(255, 193, 7, 0.14)',
    boxShadow: 'inset 3px 0 0 #c99300',
  },
})

/** Marks where edit would apply; false when the document no longer has it. */
export function showProposal(view: EditorView, id: string, edit: ProposedEdit) {
  if (!view.state.field(highlightField, false)) return false
  const from = findEdit(view, edit)
  if (from === null) return false
  const to = from + edit.oldText.length
  view.dispatch({ effects: addHighlight.of({ id, from, to }) })
  return true
}

export function hideProposal(view: EditorView, id: string) {
  const highlights = view.state.field(highlightField, false)
  if (highlights?.some(highlight => highlight.id === id)) {
    view.dispatch({ effects: removeHighlight.of(id) })
  }
}

// sourceEditorExtensions modules export `extension`, a factory
export const extension = (): Extension => [highlightField, theme]
