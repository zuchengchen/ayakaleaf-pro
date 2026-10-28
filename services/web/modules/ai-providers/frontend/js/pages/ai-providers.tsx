import '@/utils/meta'
import '@/utils/webpack-public-path'
import '@/infrastructure/error-reporter'
import '@/features/header-footer-react'
import '@/i18n'
import { createRoot } from 'react-dom/client'
import AiProvidersRoot from '../ai-providers-root'

const element = document.getElementById('ai-providers-root')
if (element) {
  const root = createRoot(element)
  root.render(<AiProvidersRoot />)
}
