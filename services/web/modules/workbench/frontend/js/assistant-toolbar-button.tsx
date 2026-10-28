/**
 * LOCAL: an AI button at the start of the editor toolbar that opens and
 * closes the assistant (overleafModuleImports.sourceEditorToolbarStartButtons).
 */
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import useAiAccess from './hooks/use-ai-access'
import { useAssistantDock } from './assistant-dock-context'

export default function AssistantToolbarButton() {
  const hasAccess = useAiAccess()
  const { toggle } = useAssistantDock()
  if (!hasAccess) return null
  return (
    <div className="ol-editor-toolbar-button-group">
      <OLTooltip id="toolbar-ai-assistant" description="AI assistant" overlayProps={{ placement: 'bottom' }}>
        <button
          type="button"
          className="btn btn-sm d-inline-flex align-items-center gap-1 rounded-pill px-2 py-0 fw-bold"
          style={{ color: 'var(--white)', backgroundColor: 'var(--green-50)', whiteSpace: 'nowrap' }}
          aria-label="AI assistant"
          onClick={toggle}
        >
          <MaterialIcon type="auto_awesome" /> AI
        </button>
      </OLTooltip>
    </div>
  )
}
