/**
 * LOCAL: asks the open chat something from outside it, such as the editor's
 * selection menu. The chat sends it with the selection as context.
 */
const ASK_EVENT = 'workbench:ask'

export function askAssistant(text: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text } }))
}

export function onAskAssistant(listener: (text: string) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<{ text: string }>).detail.text)
  window.addEventListener(ASK_EVENT, handle)
  return () => window.removeEventListener(ASK_EVENT, handle)
}
