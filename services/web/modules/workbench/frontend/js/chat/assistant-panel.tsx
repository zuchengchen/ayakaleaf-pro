/**
 * The assistant's panel: a header with new chat, history, dock side and
 * close, and the chat below it. A new chat is a fresh ChatView under a new id.
 * LOCAL: open chats are tabs; every tab keeps its ChatView mounted, so a chat
 * goes on working while another one is shown.
 */
import { useCallback, useEffect, useState } from 'react'
import customLocalStorage from '@/infrastructure/local-storage'
import { useTranslation } from 'react-i18next'
import { v4 as uuid } from 'uuid'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useEditorViewContext } from '@/features/ide-react/context/editor-view-context'
import { useRailContext } from '@/features/ide-react/context/rail-context'
import { useAssistantDock } from '../assistant-dock-context'
import { onAskAssistant } from '../assistant-events'
import ChatView from './chat-view'
import { useProjectContext } from '@/shared/context/project-context'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import HistoryList from '@modules/chat-history/frontend/js/history-list'
import { getChat, listChats, type SavedChat } from '@modules/chat-history/frontend/js/api'
import ChatTabs from './chat-tabs'

type Tab = { id: string; saved?: SavedChat; title: string; busy: boolean }

const MAX_TABS = 8
const tabsKey = (projectId: string) => `workbench.chat-tabs.${projectId}`

function newTab(): Tab {
  return { id: uuid(), title: '', busy: false }
}

function fromSaved(saved: SavedChat): Tab {
  return { id: saved.id, saved, title: saved.title, busy: false }
}

/** The tabs open last time, or the latest chat, or a new one. */
async function restoreTabs(projectId: string): Promise<{ tabs: Tab[]; activeId: string }> {
  const stored = customLocalStorage.getItem(tabsKey(projectId))
  const ids: string[] = Array.isArray(stored?.ids)
    ? stored.ids.filter((id: unknown) => typeof id === 'string').slice(0, MAX_TABS)
    : []
  // Tabs that never got a message were not saved, and are left closed
  const loaded = await Promise.all(
    ids.map(id => getChat(projectId, id).then(fromSaved, () => null))
  )
  let tabs = loaded.filter((tab): tab is Tab => tab !== null)
  if (!tabs.length) {
    const latest = await listChats(projectId)
      .then(chats => (chats[0] ? getChat(projectId, chats[0].id) : null))
      .catch(() => null)
    tabs = [latest ? fromSaved(latest) : newTab()]
  }
  const activeId = tabs.find(tab => tab.id === stored?.active)?.id ?? tabs[0].id
  return { tabs, activeId }
}

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
  const { side, moveTo, setOpen, show } = useAssistantDock()
  const { isOpen, setIsOpen } = useRailContext()
  // LOCAL: chats are kept per project, and the open ones are tabs
  const { projectId } = useProjectContext()
  const [tabs, setTabs] = useState<Tab[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    let current = true
    restoreTabs(projectId).then(restored => {
      if (!current) return
      setTabs(restored.tabs)
      setActiveId(restored.activeId)
    })
    return () => {
      current = false
    }
  }, [projectId])

  useEffect(() => {
    if (tabs && activeId) {
      customLocalStorage.setItem(tabsKey(projectId), { ids: tabs.map(tab => tab.id), active: activeId })
    }
  }, [projectId, tabs, activeId])

  // LOCAL: a question from the selection menu shows the chat it goes to
  useEffect(
    () =>
      onAskAssistant(() => {
        setShowHistory(false)
        show()
      }),
    [show]
  )

  /** Adds a tab, closing the oldest idle one beyond MAX_TABS. */
  const addTab = (tab: Tab) => {
    setTabs(current => {
      let next = [...(current ?? []), tab]
      while (next.length > MAX_TABS) {
        const idle = next.findIndex(other => !other.busy && other.id !== tab.id)
        if (idle === -1) break
        next = next.filter((_, index) => index !== idle)
      }
      return next
    })
    setActiveId(tab.id)
  }

  const openNewTab = () => {
    setShowHistory(false)
    // An empty chat is reused rather than opening another
    const empty = tabs?.find(tab => !tab.title && !tab.saved)
    if (empty) setActiveId(empty.id)
    else addTab(newTab())
  }

  const selectTab = (id: string) => {
    setShowHistory(false)
    setActiveId(id)
  }

  const closeTab = (id: string) => {
    if (!tabs) return
    const index = tabs.findIndex(tab => tab.id === id)
    const rest = tabs.filter(tab => tab.id !== id)
    if (!rest.length) {
      const fresh = newTab()
      setTabs([fresh])
      setActiveId(fresh.id)
      return
    }
    setTabs(rest)
    if (id === activeId) setActiveId(rest[Math.min(index, rest.length - 1)].id)
  }

  const openChat = async (id: string) => {
    setShowHistory(false)
    if (tabs?.some(tab => tab.id === id)) {
      setActiveId(id)
      return
    }
    try {
      addTab(fromSaved(await getChat(projectId, id)))
    } catch {
      // Deleted elsewhere, or gone with the project's history
    }
  }

  const updateTab = useCallback((id: string, status: { title: string; busy: boolean }) => {
    setTabs(current =>
      current?.map(tab =>
        tab.id === id && (tab.title !== (status.title || tab.title) || tab.busy !== status.busy)
          ? { ...tab, title: status.title || tab.title, busy: status.busy }
          : tab
      ) ?? current
    )
  }, [])

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
              onClick={openNewTab}
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
      {tabs && (
        <ChatTabs
          tabs={tabs}
          activeId={showHistory ? null : activeId}
          onSelect={selectTab}
          onClose={closeTab}
          onNew={openNewTab}
        />
      )}
      {showHistory && activeId && (
        <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
          <HistoryList
            projectId={projectId}
            currentChatId={activeId}
            onOpen={openChat}
            onDeleted={id => tabs?.some(tab => tab.id === id) && closeTab(id)}
          />
        </div>
      )}
      {/* Hidden, not unmounted, so replies keep streaming behind other tabs and the history */}
      {tabs ? (
        tabs.map(tab => {
          const shown = !showHistory && tab.id === activeId
          return (
            <div
              key={tab.id}
              className={shown ? 'flex-grow-1 overflow-hidden' : 'd-none'}
              style={{ minHeight: 0 }}
            >
              <ChatView
                chatId={tab.id}
                view={view}
                initialMessages={tab.saved?.messages}
                initialSummary={tab.saved?.summary}
                active={shown}
                onStatus={status => updateTab(tab.id, status)}
              />
            </div>
          )
        })
      ) : (
        <div className="p-3">
          <OLSpinner size="sm" />
        </div>
      )}
    </div>
  )
}
