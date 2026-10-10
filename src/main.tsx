import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PwaUpdateNotice from './pwa/PwaUpdateNotice'
import { startForegroundUpdates } from './pwa/foregroundUpdate'

if (import.meta.env.PROD) startForegroundUpdates(import.meta.env.BASE_URL)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaUpdateNotice />
  </StrictMode>,
)
