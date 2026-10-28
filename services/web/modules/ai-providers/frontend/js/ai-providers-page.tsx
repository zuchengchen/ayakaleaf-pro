/**
 * The admin page for AI gateways: each provider has a base URL, an API key
 * and models; each use (chat, images, PDF files, error fixes) gets a model;
 * some models can be offered to users in the chat.
 */
import { useEffect, useState } from 'react'
import {
  deleteJSON,
  getJSON,
  getUserFacingMessage,
  postJSON,
} from '@/infrastructure/fetch-json'
import Notification from '@/shared/components/notification'
import OLButton from '@/shared/components/ol/ol-button'
import OLCol from '@/shared/components/ol/ol-col'
import OLFormCheckbox from '@/shared/components/ol/ol-form-checkbox'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import OLFormText from '@/shared/components/ol/ol-form-text'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import OLRow from '@/shared/components/ol/ol-row'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import ProviderCard from './provider-card'
import { newId } from './new-id'
import type { AdminConfig, Provider, Role, TestResult } from './types'

const ROLES: { role: Role; label: string; help: string }[] = [
  {
    role: 'chat',
    label: 'Default chat model',
    help: 'Used for the chat, summaries of long chats, and whatever has no model of its own.',
  },
  {
    role: 'image',
    label: 'Chats with images',
    help: 'For chats with images or rendered PDF pages. The model has to accept images.',
  },
  {
    role: 'pdf',
    label: 'Chats with PDF files',
    help: 'For chats with attached PDF files. The model has to accept PDF files.',
  },
  {
    role: 'errorAssistant',
    label: 'Compile error fixes',
    help: 'For the "fix this error" suggestions in the compile log.',
  },
]

type Form = {
  enabled: boolean
  providers: Provider[]
  roles: Record<Role, string | null>
}

function toForm(config: AdminConfig): Form {
  return {
    enabled: config.enabled,
    providers: config.providers.map(provider => ({ ...provider, apiKey: '' })),
    roles: config.roles,
  }
}

export default function AiProvidersPage() {
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null)
  const [tests, setTests] = useState<Record<string, TestResult>>({})

  const loaded = (next: AdminConfig) => {
    setConfig(next)
    setForm(toForm(next))
  }

  useEffect(() => {
    getJSON<AdminConfig>('/admin/ai-providers/config')
      .then(loaded)
      .catch(error =>
        setStatus({ type: 'error', message: getUserFacingMessage(error) ?? 'Could not load the configuration.' })
      )
  }, [])

  if (!form || !config) {
    return (
      <div className="container">
        {status ? (
          <Notification type="error" content={status.message} />
        ) : (
          <OLSpinner size="sm" />
        )}
      </div>
    )
  }

  const update = (change: Partial<Form>) => {
    setStatus(null)
    setForm({ ...form, ...change })
  }

  // Uses of models that are gone fall back to the chat model
  const setProviders = (providers: Provider[]) => {
    const modelIds = new Set(providers.flatMap(p => p.models.map(m => m.id)))
    const roles = { ...form.roles }
    for (const { role } of ROLES) {
      if (roles[role] && !modelIds.has(roles[role]!)) roles[role] = null
    }
    update({ providers, roles })
  }

  const updateProvider = (index: number, provider: Provider) =>
    setProviders(form.providers.map((other, i) => (i === index ? provider : other)))

  const removeProvider = (index: number) =>
    setProviders(form.providers.filter((_, other) => other !== index))

  const addProvider = () => {
    update({
      providers: [
        ...form.providers,
        {
          id: newId(),
          name: '',
          baseURL: '',
          apiKey: '',
          apiKeyHint: '',
          hasApiKey: false,
          models: [{ id: newId(), model: '', label: '', selectable: false, efforts: [] }],
        },
      ],
    })
  }

  const testModel = async (provider: Provider, modelId: string) => {
    const model = provider.models.find(m => m.id === modelId)
    if (!model) return
    setTests(current => ({ ...current, [modelId]: { state: 'running' } }))
    try {
      const result = await postJSON('/admin/ai-providers/test', {
        body: {
          providerId: provider.id,
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
          model: model.model,
        },
      })
      setTests(current => ({
        ...current,
        [modelId]: result.ok
          ? { state: 'ok', text: result.text, ms: result.ms }
          : { state: 'error', message: result.message },
      }))
    } catch (error) {
      setTests(current => ({
        ...current,
        [modelId]: { state: 'error', message: getUserFacingMessage(error as Error) ?? 'The test failed.' },
      }))
    }
  }

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const next = await postJSON<AdminConfig>('/admin/ai-providers/config', {
        body: {
          enabled: form.enabled,
          roles: form.roles,
          providers: form.providers.map(({ id, name, baseURL, apiKey, models }) => ({
            id,
            name,
            baseURL,
            apiKey,
            models,
          })),
        },
      })
      loaded(next)
      setStatus({ type: 'success', message: 'Saved. The new settings apply to the next AI request.' })
    } catch (error) {
      setStatus({ type: 'error', message: getUserFacingMessage(error as Error) ?? 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!window.confirm('Delete these settings and go back to the AI_* environment variables?')) {
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      loaded(await deleteJSON<AdminConfig>('/admin/ai-providers/config'))
      setTests({})
      setStatus({ type: 'success', message: 'Back to the AI_* environment variables.' })
    } catch (error) {
      setStatus({ type: 'error', message: getUserFacingMessage(error as Error) ?? 'Could not reset.' })
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = form.providers.flatMap(provider =>
    provider.models
      .filter(model => model.model.trim())
      .map(model => ({
        id: model.id,
        label: `${provider.name || 'Unnamed provider'} / ${model.label || model.model}`,
      }))
  )

  return (
    <div className="container">
      <OLRow>
        <OLCol lg={{ span: 10, offset: 1 }}>
          <h1>AI Providers</h1>
          <p>
            Set up the gateways the AI assistant talks to. Any OpenAI-compatible
            API works: give its base URL (for example{' '}
            <code>https://api.openai.com/v1</code>), an API key and the models
            to use.
          </p>

          {config.source === 'env' && (
            <Notification
              type="info"
              className="mb-3"
              content="The AI_* environment variables are in use, and are filled in below. Once you save here, these settings replace them."
            />
          )}
          {!config.cipherConfigured && (
            <Notification
              type="warning"
              className="mb-3"
              content={
                <>
                  API keys are stored encrypted. Set{' '}
                  <code>AI_PROVIDER_CIPHER_PASSWORD</code> (16 characters or
                  more) on the server and restart it to save settings here.
                </>
              }
            />
          )}

          <OLPageContentCard className="mb-3">
            <OLFormCheckbox
              id="ai-enabled"
              type="switch"
              label="Enable AI features"
              checked={form.enabled}
              onChange={event => update({ enabled: event.target.checked })}
            />
          </OLPageContentCard>

          <h2 className="h3">Providers</h2>
          {form.providers.length === 0 && <p>No providers yet.</p>}
          {form.providers.map((provider, index) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              tests={tests}
              onChange={next => updateProvider(index, next)}
              onRemove={() => removeProvider(index)}
              onTest={modelId => testModel(provider, modelId)}
            />
          ))}
          <OLButton variant="secondary" leadingIcon="add" className="mb-4" onClick={addProvider}>
            Add provider
          </OLButton>

          <h2 className="h3">Models for each use</h2>
          <OLPageContentCard className="mb-3">
            {ROLES.map(({ role, label, help }) => (
              <OLFormGroup key={role} controlId={`ai-role-${role}`}>
                <OLFormLabel>{label}</OLFormLabel>
                <OLFormSelect
                  value={form.roles[role] ?? ''}
                  onChange={event =>
                    update({ roles: { ...form.roles, [role]: event.target.value || null } })
                  }
                >
                  <option value="">{role === 'chat' ? 'Choose a model' : 'Same as the default chat model'}</option>
                  {modelOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </OLFormSelect>
                <OLFormText>{help}</OLFormText>
              </OLFormGroup>
            ))}
            <OLFormText>
              Models marked &quot;Users can choose&quot; are listed in the
              chat&apos;s model menu. A model a user picks there is used for
              their whole chat, with images and PDF files too. Users can also
              pick one of a model&apos;s reasoning efforts, which is sent as{' '}
              <code>reasoning_effort</code>.
            </OLFormText>
          </OLPageContentCard>

          {status && (
            <Notification type={status.type} className="mb-3" content={status.message} />
          )}
          <div className="d-flex gap-2 mb-5">
            <OLButton
              variant="primary"
              onClick={save}
              isLoading={saving}
              disabled={saving || !config.cipherConfigured}
            >
              Save
            </OLButton>
            {config.source === 'admin' && (
              <OLButton variant="danger-ghost" onClick={reset} disabled={saving}>
                Reset to environment variables
              </OLButton>
            )}
          </div>
        </OLCol>
      </OLRow>
    </div>
  )
}
