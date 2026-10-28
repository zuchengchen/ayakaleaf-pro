import { useEffect, useState } from 'react'
import { getJSON } from '@/infrastructure/fetch-json'
import useInstanceFeatures from '@modules/instance-features/frontend/js/use-instance-features'

// Share the permission request across chat and compile-log components.
export type AiModel = { id: string; label: string; provider?: string; efforts?: string[] }
type AiAccess = {
  chat: boolean
  errorAssistant: boolean
  models: AiModel[]
  defaultModel: AiModel | null
}
let access: Promise<AiAccess> | undefined

function getAccess() {
  access ??= getJSON('/workbench/access')
    .then(
      (data: {
        allowed: boolean
        errorAssistant: boolean
        models?: AiModel[]
        defaultModel?: AiModel | null
      }) => ({
        chat: data.allowed === true,
        errorAssistant: data.errorAssistant === true,
        models: Array.isArray(data.models) ? data.models : [],
        defaultModel: data.defaultModel ?? null,
      })
    )
    .catch(() => {
      access = undefined
      return { chat: false, errorAssistant: false, models: [], defaultModel: null }
    })
  return access
}

export default function useAiAccess(feature: 'chat' | 'errorAssistant' = 'chat') {
  const { ai } = useInstanceFeatures()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!ai) return
    let active = true
    getAccess().then(value => {
      if (active) setAllowed(value[feature])
    })
    return () => {
      active = false
    }
  }, [ai, feature])

  return ai && allowed
}

// LOCAL: the models an admin lets users pick in the chat, and the default one
export function useAiModels() {
  const { ai } = useInstanceFeatures()
  const [choices, setChoices] = useState<{ models: AiModel[]; defaultModel: AiModel | null }>({
    models: [],
    defaultModel: null,
  })

  useEffect(() => {
    if (!ai) return
    let active = true
    getAccess().then(value => {
      if (active) setChoices({ models: value.models, defaultModel: value.defaultModel })
    })
    return () => {
      active = false
    }
  }, [ai])

  return choices
}
