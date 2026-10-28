/**
 * LOCAL: the open chats as tabs under the panel header. Each chat keeps
 * running while another tab is shown; a spinner marks the ones still working.
 */
import { useEffect, useRef } from 'react'
import MaterialIcon from '@/shared/components/material-icon'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { faint, flatGhost, muted, plain } from './themed'

export type ChatTab = { id: string; title: string; busy: boolean }

export default function ChatTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: ChatTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}) {
  // The selected tab stays in view when the tabs do not all fit
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  return (
    <div
      className="d-flex align-items-end ps-2 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-divider-themed)' }}
    >
      <div
        ref={strip}
        className="d-flex align-items-end gap-1 flex-grow-1"
        style={{ minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}
        role="tablist"
        aria-label="Open chats"
      >
      {tabs.map(tab => {
        const active = tab.id === activeId
        const title = tab.title || 'New chat'
        return (
          <div
            key={tab.id}
            className="d-flex align-items-center rounded-top"
            // Tabs share the width down to a few letters, then the strip scrolls
            style={{
              flex: '0 1 10rem',
              minWidth: '4.5rem',
              borderBottom: `2px solid ${active ? 'var(--green-50)' : 'transparent'}`,
              backgroundColor: active ? 'var(--bg-secondary-themed)' : 'transparent',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={title}
              className="btn btn-link text-decoration-none d-flex align-items-center gap-1 py-1 ps-2 pe-1"
              style={{ ...(active ? plain : muted), fontSize: 'var(--font-size-01)', minWidth: 0 }}
              onClick={() => onSelect(tab.id)}
            >
              {tab.busy && <OLSpinner size="sm" />}
              <span className="text-truncate" style={{ fontWeight: active ? 'bold' : undefined }}>
                {title}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-link p-0 pe-1 d-inline-flex"
              style={faint}
              aria-label={`Close ${title}`}
              onClick={() => onClose(tab.id)}
            >
              <MaterialIcon type="close" />
            </button>
          </div>
        )
      })}
      </div>
      <OLTooltip id="assistant-new-tab" description="New chat" overlayProps={{ placement: 'bottom' }}>
        <button
          type="button"
          className="btn btn-sm d-inline-flex align-items-center flex-shrink-0 p-1 mb-1 mx-1"
          style={{ ...flatGhost, ...muted }}
          aria-label="New chat tab"
          onClick={onNew}
        >
          <MaterialIcon type="add" />
        </button>
      </OLTooltip>
    </div>
  )
}
