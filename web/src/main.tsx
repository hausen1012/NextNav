import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { Providers } from './lib/query'
import { initializePwaCache } from './lib/pwa-cache'
import './index.css'

registerSW({ immediate: true })

async function renderApp() {
  await initializePwaCache().catch(() => undefined)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  )
}

void renderApp()