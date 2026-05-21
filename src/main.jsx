import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/luxe.css'

// Global auto-recover for Vite/Vercel chunk-hash mismatches. After a deploy,
// any open tab holds an index.html that references chunks with old hashes;
// nested lazy() imports inside pages (e.g. MorphingBlob inside Creative)
// also throw 'Failed to fetch dynamically imported module' when those hashes
// 404. The App.jsx lazyWithReload wrapper handles top-level routes; this
// catches everything else (sub-page lazy imports, dynamic component fetches).
// sessionStorage throttle prevents an infinite reload loop if the failure
// is real (not a stale-deploy race).
const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const RELOAD_KEY = 'sid-chunk-reload-at'
function maybeReload(msg) {
  if (!msg || !CHUNK_RE.test(String(msg))) return
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0')
  if (Date.now() - last <= 30_000) return     // already reloaded once in last 30s — let it bubble
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  window.location.reload()
}
window.addEventListener('error', (e) => maybeReload(e?.message))
window.addEventListener('unhandledrejection', (e) => maybeReload(e?.reason?.message || e?.reason))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
