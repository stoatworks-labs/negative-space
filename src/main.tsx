import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// The shared Stoatworks theme first. Vendored from stoatworks-backend/theme by scripts/sync-theme.sh.
import './stoatworks-theme.css'
import './styles.css'
import { registerServiceWorker } from './register-sw'

// The About dialog's data file ships a version baked at sync time; this is the
// one the build actually produced. Spread, not assign: about-data.js may not
// have run yet, and it merges rather than overwriting. See public/about.js.
window.STOATWORKS_ABOUT = { ...window.STOATWORKS_ABOUT, version: __APP_VERSION__ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
