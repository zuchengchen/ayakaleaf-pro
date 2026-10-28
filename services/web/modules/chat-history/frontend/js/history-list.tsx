/**
 * The user's earlier chats in this project, newest first: open one to go on
 * with it, or delete it.
 */
import { useEffect, useState } from 'react'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import { fromNowDate } from '@/utils/dates'
import { debugConsole } from '@/utils/debugging'
import { faint, flatGhost, muted, plain, ruleAbove } from '@modules/workbench/frontend/js/chat/themed'
import { deleteChat, listChats, type ChatListItem } from './api'

export default function HistoryList({
  projectId,
  currentChatId,
  onOpen,
  onDeleted,
}: {
  projectId: string
  currentChatId: string
  onOpen: (chatId: string) => void
  onDeleted?: (chatId: string) => void
}) {
  const [chats, setChats] = useState<ChatListItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    listChats(projectId)
      .then(setChats)
      .catch(error => {
        debugConsole.error(error)
        setFailed(true)
      })
  }, [projectId])

  const remove = async (chatId: string) => {
    setChats(current => current?.filter(chat => chat.id !== chatId) ?? null)
    onDeleted?.(chatId)
    try {
      await deleteChat(projectId, chatId)
    } catch (error) {
      debugConsole.error(error)
    }
  }

  if (failed) {
    return <p className="p-3" style={muted}>The chat history could not be loaded.</p>
  }
  if (!chats) {
    return (
      <div className="p-3">
        <OLSpinner size="sm" />
      </div>
    )
  }
  if (chats.length === 0) {
    return <p className="p-3" style={muted}>No earlier chats in this project.</p>
  }

  return (
    <ul className="list-unstyled m-0 h-100 overflow-auto" aria-label="Chat history">
      {chats.map((chat, index) => (
        <li
          key={chat.id}
          className="d-flex align-items-center gap-1 px-2"
          style={index > 0 ? ruleAbove : undefined}
        >
          <button
            type="button"
            className="btn btn-link text-start text-decoration-none flex-grow-1 py-2 px-1"
            style={{ minWidth: 0 }}
            onClick={() => onOpen(chat.id)}
          >
            <span
              className="d-block text-truncate"
              style={{ ...plain, fontWeight: chat.id === currentChatId ? 'bold' : undefined }}
            >
              {chat.title || 'Untitled chat'}
            </span>
            <span className="d-block small" style={faint}>
              {fromNowDate(chat.updatedAt)}
            </span>
          </button>
          <OLIconButton
            size="sm"
            variant="ghost"
            icon="delete"
            style={{ ...flatGhost, ...muted }}
            accessibilityLabel={`Delete ${chat.title || 'chat'}`}
            onClick={() => remove(chat.id)}
          />
        </li>
      ))}
    </ul>
  )
}
