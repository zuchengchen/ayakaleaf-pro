import useWaitForI18n from '@/shared/hooks/use-wait-for-i18n'
import withErrorBoundary from '@/infrastructure/error-boundary'
import { GenericErrorBoundaryFallback } from '@/shared/components/generic-error-boundary-fallback'
import AiProvidersPage from './ai-providers-page'

function AiProvidersRoot() {
  const { isReady } = useWaitForI18n()
  if (!isReady) return null
  return <AiProvidersPage />
}

export default withErrorBoundary(AiProvidersRoot, () => (
  <GenericErrorBoundaryFallback />
))
