/**
 * LOCAL: shows a pending propose_edit in the open document as the chat shows
 * it, a word diff with removed words struck out and added words inserted,
 * until the user applies or rejects it
 * (overleafModuleImports.sourceEditorExtensions).
 */
import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { findEdit, wordDiff, type ProposedEdit } from './apply-edit'

/** Text the edit would add, drawn where it would go. */
class AddedText extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  eq(other: AddedText) {
    return other.text === this.text
  }

  toDOM() {
    const ins = document.createElement('ins')
    ins.className = 'ol-ai-proposal-added'
    ins.textContent = this.text
    return ins
  }

  ignoreEvent() {
    return false
  }
}

const removedMark = Decoration.mark({ class: 'ol-ai-proposal-removed', tagName: 'del' })
const lineMark = Decoration.line({ class: 'ol-ai-proposal-line' })

const addProposal = StateEffect.define<{ id: string; decorations: DecorationSet }>()
const removeProposal = StateEffect.define<string>()

const proposalField = StateField.define<Map<string, DecorationSet>>({
  create: () => new Map(),
  update(proposals, transaction) {
    let next = proposals
    if (transaction.docChanged) {
      next = new Map([...next].map(([id, set]) => [id, set.map(transaction.changes)]))
    }
    for (const effect of transaction.effects) {
      if (effect.is(addProposal)) {
        next = new Map(next).set(effect.value.id, effect.value.decorations)
      } else if (effect.is(removeProposal) && next.has(effect.value)) {
        next = new Map(next)
        next.delete(effect.value)
      }
    }
    return next
  },
  provide: field =>
    EditorView.decorations.from(field, proposals => RangeSet.join([...proposals.values()])),
})

// The chat's colors for the diff (themed.ts useChangeColors)
const theme = EditorView.baseTheme({
  '.ol-ai-proposal-line': {
    boxShadow: 'inset 3px 0 0 var(--green-50)',
  },
  '&light .ol-ai-proposal-removed': { color: 'var(--red-50)', textDecoration: 'line-through' },
  '&dark .ol-ai-proposal-removed': { color: 'var(--red-30)', textDecoration: 'line-through' },
  '.ol-ai-proposal-added': { textDecoration: 'none', whiteSpace: 'pre-wrap' },
  '&light .ol-ai-proposal-added': { backgroundColor: 'var(--green-10)', color: 'var(--green-70)' },
  '&dark .ol-ai-proposal-added': { backgroundColor: 'var(--green-70)', color: 'var(--white)' },
})

/** Draws edit as a word diff where it would apply; false when the document no longer has it. */
export function showProposal(view: EditorView, id: string, edit: ProposedEdit) {
  if (!view.state.field(proposalField, false)) return false
  const start = findEdit(view, edit)
  if (start === null) return false
  const { doc } = view.state

  // The same diff the chat shows, placed the way applyEdit places it
  const ranges = []
  let position = start
  for (const part of wordDiff(edit.oldText, edit.newText)) {
    if (part.added) {
      ranges.push(Decoration.widget({ widget: new AddedText(part.value), side: 1 }).range(position))
    } else {
      if (part.removed && part.value.length) {
        ranges.push(removedMark.range(position, position + part.value.length))
      }
      position += part.value.length
    }
  }
  const last = doc.lineAt(Math.max(start, start + edit.oldText.length - (edit.oldText ? 1 : 0))).number
  for (let number = doc.lineAt(start).number; number <= last; number++) {
    ranges.push(lineMark.range(doc.line(number).from))
  }

  view.dispatch({ effects: addProposal.of({ id, decorations: Decoration.set(ranges, true) }) })
  return true
}

export function hideProposal(view: EditorView, id: string) {
  if (view.state.field(proposalField, false)?.has(id)) {
    view.dispatch({ effects: removeProposal.of(id) })
  }
}

// sourceEditorExtensions modules export `extension`, a factory
export const extension = (): Extension => [proposalField, theme]
