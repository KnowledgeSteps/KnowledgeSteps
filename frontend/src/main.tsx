import { LoadingBoundary } from './components/ui/LoadingBoundary'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { App } from './App'
import { appTheme, installVisualTokens } from './design/theme'
import './design/fonts.css'
import './styles.css'
import './design/cards.css'

installVisualTokens()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={appTheme}
    >
      <AntApp>
        <BrowserRouter>
          <LoadingBoundary><App /></LoadingBoundary>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
