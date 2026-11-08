import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/alfa-slab-one/400.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/900.css'
import '@fontsource/old-standard-tt/400.css'
import '@fontsource/old-standard-tt/700.css'
import '@fontsource/playfair-display/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// offline app shell (production build only, so the dev server is never served stale files)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}
