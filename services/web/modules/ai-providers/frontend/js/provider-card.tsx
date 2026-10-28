/**
 * One gateway: its name, base URL and API key, and its models with a
 * test button each.
 */
import OLButton from '@/shared/components/ol/ol-button'
import OLFormCheckbox from '@/shared/components/ol/ol-form-checkbox'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormText from '@/shared/components/ol/ol-form-text'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import MaterialIcon from '@/shared/components/material-icon'
import { newId } from './new-id'
import type { Model, Provider, TestResult } from './types'

function TestStatus({ result }: { result?: TestResult }) {
  if (!result) return null
  if (result.state === 'running') return <OLSpinner size="sm" />
  if (result.state === 'ok') {
    return (
      <span className="text-success small d-inline-flex align-items-center gap-1">
        <MaterialIcon type="check_circle" /> Works ({result.ms} ms)
      </span>
    )
  }
  return (
    <span className="text-danger small d-inline-flex align-items-center gap-1 text-break">
      <MaterialIcon type="error" /> {result.message}
    </span>
  )
}

export default function ProviderCard({
  provider,
  tests,
  onChange,
  onRemove,
  onTest,
}: {
  provider: Provider
  tests: Record<string, TestResult>
  onChange: (provider: Provider) => void
  onRemove: () => void
  onTest: (modelId: string) => void
}) {
  const id = (field: string) => `ai-provider-${provider.id}-${field}`
  const set = (change: Partial<Provider>) => onChange({ ...provider, ...change })
  const setModel = (index: number, change: Partial<Model>) =>
    set({
      models: provider.models.map((model, i) => (i === index ? { ...model, ...change } : model)),
    })

  return (
    <OLPageContentCard className="mb-3">
      <div className="d-flex align-items-start gap-3">
        <OLFormGroup controlId={id('name')} className="flex-grow-1">
          <OLFormLabel>Name</OLFormLabel>
          <OLFormControl
            value={provider.name}
            placeholder="OpenAI"
            onChange={event => set({ name: event.target.value })}
          />
        </OLFormGroup>
        <OLButton variant="danger-ghost" leadingIcon="delete" className="mt-4" onClick={onRemove}>
          Remove provider
        </OLButton>
      </div>
      <OLFormGroup controlId={id('url')}>
        <OLFormLabel>Base URL</OLFormLabel>
        <OLFormControl
          value={provider.baseURL}
          placeholder="https://api.openai.com/v1"
          onChange={event => set({ baseURL: event.target.value })}
        />
      </OLFormGroup>
      <OLFormGroup controlId={id('key')}>
        <OLFormLabel>API key</OLFormLabel>
        <OLFormControl
          type="password"
          autoComplete="new-password"
          value={provider.apiKey}
          placeholder={provider.hasApiKey ? `Saved key ${provider.apiKeyHint}` : 'sk-...'}
          onChange={event => set({ apiKey: event.target.value })}
        />
        {provider.hasApiKey && (
          <OLFormText>Leave blank to keep the saved key.</OLFormText>
        )}
      </OLFormGroup>

      <OLFormLabel as="div">Models</OLFormLabel>
      <table className="table table-sm align-middle mb-2">
        <thead>
          <tr>
            <th scope="col">Model name</th>
            <th scope="col">Display name</th>
            <th scope="col">Users can choose</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {provider.models.map((model, index) => (
            <tr key={model.id}>
              <td>
                <OLFormControl
                  size="sm"
                  aria-label="Model name"
                  value={model.model}
                  placeholder="gpt-4o"
                  onChange={event => setModel(index, { model: event.target.value })}
                />
                <TestStatus result={tests[model.id]} />
              </td>
              <td>
                <OLFormControl
                  size="sm"
                  aria-label="Display name"
                  value={model.label}
                  placeholder={model.model || 'GPT-4o'}
                  onChange={event => setModel(index, { label: event.target.value })}
                />
              </td>
              <td>
                <OLFormCheckbox
                  aria-label="Users can choose"
                  checked={model.selectable}
                  onChange={event => setModel(index, { selectable: event.target.checked })}
                />
              </td>
              <td className="text-nowrap">
                <OLButton
                  size="sm"
                  variant="secondary"
                  disabled={!provider.baseURL || !model.model || tests[model.id]?.state === 'running'}
                  onClick={() => onTest(model.id)}
                >
                  Test
                </OLButton>{' '}
                <OLIconButton
                  size="sm"
                  variant="ghost"
                  icon="close"
                  accessibilityLabel="Remove model"
                  disabled={provider.models.length === 1}
                  onClick={() => set({ models: provider.models.filter((_, i) => i !== index) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <OLButton
        size="sm"
        variant="ghost"
        leadingIcon="add"
        onClick={() =>
          set({
            models: [...provider.models, { id: newId(), model: '', label: '', selectable: false }],
          })
        }
      >
        Add model
      </OLButton>
    </OLPageContentCard>
  )
}
