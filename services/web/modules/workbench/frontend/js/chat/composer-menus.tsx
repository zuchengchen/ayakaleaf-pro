/**
 * LOCAL: the menus beside the composer's attach button: the model, its
 * reasoning effort, and whether proposed edits are applied without asking.
 */
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import type { AiModel } from '../hooks/use-ai-access'
import { muted, plain } from './themed'

// Bootstrap leaves room for a wide arrow; the composer row is narrow
const menu = {
  ...plain,
  backgroundColor: 'transparent',
  minWidth: 0,
  paddingRight: '1.25rem',
  backgroundPosition: 'right 0.2rem center',
}

/** Models by provider; one provider needs no groups. */
function modelGroups(models: AiModel[]): [string, AiModel[]][] {
  const groups = new Map<string, AiModel[]>()
  for (const model of models) {
    const provider = model.provider ?? ''
    groups.set(provider, [...(groups.get(provider) ?? []), model])
  }
  return groups.size > 1 ? [...groups] : [['', models]]
}

function ModelOptions({ models }: { models: AiModel[] }) {
  return (
    <>
      {modelGroups(models).map(([provider, group]) => {
        const options = group.map(option => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))
        return provider ? (
          <optgroup key={provider} label={provider}>
            {options}
          </optgroup>
        ) : (
          options
        )
      })}
    </>
  )
}

export default function ComposerMenus({
  models,
  defaultModel,
  model,
  onModelChange,
  efforts,
  effort,
  onEffortChange,
  autoApply,
  onAutoApplyChange,
}: {
  models: AiModel[]
  defaultModel: AiModel | null
  /** '' for the admin's default model */
  model: string
  onModelChange: (model: string) => void
  efforts: string[]
  effort: string
  onEffortChange: (effort: string) => void
  autoApply: boolean
  onAutoApplyChange: (autoApply: boolean) => void
}) {
  // The default model is listed once, under its own name
  const others = models.filter(option => option.id !== defaultModel?.id)
  return (
    // Between the attach and send buttons, taking the room they leave
    <div className="d-flex align-items-center gap-1 flex-grow-1" style={{ minWidth: 0 }}>
      {others.length > 0 ? (
        <select
          className="form-select form-select-sm w-auto border-0 shadow-none text-truncate ps-1"
          style={{ ...menu, minWidth: '3.5rem' }}
          aria-label="Model"
          title={others.find(option => option.id === model)?.label ?? defaultModel?.label}
          value={model}
          onChange={event => onModelChange(event.target.value)}
        >
          <option value="">{defaultModel?.label ?? 'Default model'}</option>
          <ModelOptions models={others} />
        </select>
      ) : (
        defaultModel && (
          <span className="small text-truncate px-1" style={muted} title="Model">
            {defaultModel.label}
          </span>
        )
      )}
      {efforts.length > 0 && (
        <select
          className="form-select form-select-sm w-auto border-0 shadow-none ps-1"
          // A native menu is as wide as its longest level; it gives up that
          // room before the model's name does
          style={{ ...menu, minWidth: '3.75rem', flexShrink: 4 }}
          aria-label="Reasoning effort"
          title="Reasoning effort"
          value={effort}
          onChange={event => onEffortChange(event.target.value)}
        >
          <option value="">Auto</option>
          {efforts.map(level => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      )}
      <span className="flex-grow-1" />
      <OLTooltip
        id="assistant-auto-apply"
        description={autoApply ? 'Edits are applied as they come; click to review them first' : 'Apply edits without asking'}
      >
        <button
          type="button"
          className="btn btn-sm d-inline-flex align-items-center flex-shrink-0 rounded-circle p-0"
          style={
            autoApply
              ? { color: 'var(--white)', backgroundColor: 'var(--green-50)' }
              : { ...muted, border: '1px solid var(--border-divider-themed)' }
          }
          aria-label="Auto-apply edits"
          aria-pressed={autoApply}
          onClick={() => onAutoApplyChange(!autoApply)}
        >
          <MaterialIcon type="bolt" />
        </button>
      </OLTooltip>
    </div>
  )
}
