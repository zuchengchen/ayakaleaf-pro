import { useEffect, useState } from 'react'
import { getJSON } from '@/infrastructure/fetch-json'
import useInstanceFeatures from '@modules/instance-features/frontend/js/use-instance-features'

// Share the permission request across chat and compile-log components.
export type AiModel = { id: string; label: string }
type AiAccess = { chat: boolean; errorAssistant: boolean; models: AiModel[] }
let access: Promise<AiAccess> | undefined

function getAccess() {
  access ??= getJSON('/workbench/access')
    .then(
      (data: { allowed: boolean; errorAssistant: boolean; models?: AiModel[] }) => ({
        chat: data.allowed === true,
        errorAssistant: data.errorAssistant === true,
        models: Array.isArray(data.models) ? data.models : [],
      })
    )
    .catch(() => {
      access = undefined
      return { chat: false, errorAssistant: false, models: [] }
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

// LOCAL: the models an admin lets users pick in the chat
export function useAiModels() {
  const { ai } = useInstanceFeatures()
  const [models, setModels] = useState<AiModel[]>([])

  useEffect(() => {
    if (!ai) return
    let active = true
    getAccess().then(value => {
      if (active) setModels(value.models)
    })
    return () => {
      active = false
    }
  }, [ai])

  return models
}
