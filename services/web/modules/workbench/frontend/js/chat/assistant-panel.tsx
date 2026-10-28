/**
 * The assistant's panel: a header with new chat, history, dock side and
 * close, and the chat below it. A new chat is a fresh ChatView under a new id.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuid } from 'uuid'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useEditorViewContext } from '@/features/ide-react/context/editor-view-context'
import { useRailContext } from '@/features/ide-react/context/rail-context'
import { useAssistantDock } from '../assistant-dock-context'
import ChatView from './chat-view'
import { useProjectContext } from '@/shared/context/project-context'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import HistoryList from '@modules/chat-history/frontend/js/history-list'
import { getChat, listChats, type SavedChat } from '@modules/chat-history/frontend/js/api'

function HeaderButton({
  id,
  label,
  icon,
  unfilled = false,
  onClick,
}: {
  id: string
  label: string
  icon: string
  unfilled?: boolean
  onClick: () => void
}) {
  return (
    <OLTooltip id={id} description={label} overlayProps={{ placement: 'bottom' }}>
      <OLIconButton
        className="rail-panel-header-button-subdued"
        size="sm"
        icon={icon}
        unfilled={unfilled as any}
        accessibilityLabel={label}
        onClick={onClick}
      />
    </OLTooltip>
  )
}

export default function AssistantPanel() {
  const { t } = useTranslation()
  const { view } = useEditorViewContext()
  const { side, moveTo, setOpen } = useAssistantDock()
  const { isOpen, setIsOpen } = useRailContext()
  // LOCAL: chats are kept per project; the panel opens on the latest one
  const { projectId } = useProjectContext()
  const [chat, setChat] = useState<{ id: string; saved?: SavedChat } | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    let active = true
    listChats(projectId)
      .then(chats => (chats[0] ? getChat(projectId, chats[0].id) : null))
      .catch(() => null)
      .then(saved => {
        if (active) setChat(saved ? { id: saved.id, saved } : { id: uuid() })
      })
    return () => {
      active = false
    }
  }, [projectId])

  const newChat = () => {
    setShowHistory(false)
    setChat({ id: uuid() })
  }

  const openChat = async (id: string) => {
    setShowHistory(false)
    if (id === chat?.id) return
    try {
      const saved = await getChat(projectId, id)
      setChat({ id, saved })
    } catch {
      // Deleted elsewhere, or gone with the project's history
    }
  }

  if (!view) return null

  const close = () => {
    setOpen(false)
    // The shared rail header also closes the rail; only right for a left dock
    if (side === 'left') setIsOpen(false)
    else setIsOpen(isOpen)
  }

  return (
    <div className="d-flex flex-column h-100" data-assistant-panel="">
      <RailPanelHeader
        title="AI assistant"
        actions={
          <>
            <HeaderButton
              id="assistant-new-chat"
              label={t('start_new_chat')}
              icon="edit_square"
              unfilled
              onClick={newChat}
            />
            <HeaderButton
              id="assistant-history"
              label={showHistory ? 'Back to the chat' : 'Chat history'}
              icon={showHistory ? 'chat' : 'history'}
              onClick={() => setShowHistory(!showHistory)}
            />
            <HeaderButton
              id="assistant-dock-side"
              label={side === 'left' ? t('move_to_the_right') : t('move_to_the_left')}
              icon={side === 'left' ? 'dock_to_left' : 'dock_to_right'}
              onClick={() => moveTo(side === 'left' ? 'right' : 'left')}
            />
          </>
        }
        onClose={close}
      />
      {showHistory && chat && (
        <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
          <HistoryList projectId={projectId} currentChatId={chat.id} onOpen={openChat} />
        </div>
      )}
      {/* Hidden, not unmounted, so a reply keeps streaming behind the history */}
      <div
        className={showHistory ? 'd-none' : 'flex-grow-1 overflow-hidden'}
        style={{ minHeight: 0 }}
      >
        {chat ? (
          <ChatView
            chatId={chat.id}
            view={view}
            key={chat.id}
            initialMessages={chat.saved?.messages}
            initialSummary={chat.saved?.summary}
          />
        ) : (
          <div className="p-3">
            <OLSpinner size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}
