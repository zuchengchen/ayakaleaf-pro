import '@/utils/meta'
import '@/utils/webpack-public-path'
import '@/infrastructure/error-reporter'
import '@/features/header-footer-react'
import '@/i18n'
import { createRoot } from 'react-dom/client'
import useWaitForI18n from '@/shared/hooks/use-wait-for-i18n'
import withErrorBoundary from '@/infrastructure/error-boundary'
import { GenericErrorBoundaryFallback } from '@/shared/components/generic-error-boundary-fallback'
import RedeemPage from '../redeem-page'

const Root = withErrorBoundary(
  function Root() {
    const { isReady } = useWaitForI18n()
    return isReady ? <RedeemPage /> : null
  },
  () => <GenericErrorBoundaryFallback />
)

const element = document.getElementById('ai-redeem-root')
if (element) {
  createRoot(element).render(<Root />)
}
