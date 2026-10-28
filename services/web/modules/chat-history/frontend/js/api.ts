import type { UIMessage } from 'ai'
import { deleteJSON, getJSON, putJSON } from '@/infrastructure/fetch-json'

/** Set by the server when it summarizes turns up to and including a message. */
export type Summary = { summary: string; upToMessageId: string }

export type ChatListItem = { id: string; title: string; updatedAt: string }

export type SavedChat = {
  id: string
  title: string
  messages: UIMessage[]
  summary: Summary | null
}

const base = (projectId: string) => `/project/${projectId}/workbench/chats`

export async function listChats(projectId: string) {
  const { chats } = await getJSON<{ chats: ChatListItem[] }>(base(projectId))
  return chats
}

export async function getChat(projectId: string, chatId: string) {
  const chat = await getJSON<SavedChat>(`${base(projectId)}/${chatId}`)
  return { ...chat, messages: restorable(chat.messages) }
}

export function saveChat(
  projectId: string,
  chatId: string,
  body: { messages: UIMessage[]; summary: Summary | null }
) {
  return putJSON(`${base(projectId)}/${chatId}`, { body })
}

export function deleteChat(projectId: string, chatId: string) {
  return deleteJSON(`${base(projectId)}/${chatId}`)
}

/**
 * A chat saved while a tool was running has a call without a result, which
 * the model would refuse; such calls are marked as interrupted.
 */
export function restorable(messages: UIMessage[]): UIMessage[] {
  return messages.map(message => ({
    ...message,
    parts: message.parts.map(part => {
      const isTool = part.type.startsWith('tool-') || part.type === 'dynamic-tool'
      if (
        isTool &&
        'state' in part &&
        part.state !== 'output-available' &&
        part.state !== 'output-error'
      ) {
        return { ...part, state: 'output-error', errorText: 'Interrupted.' } as unknown as typeof part
      }
      return part
    }),
  }))
}
