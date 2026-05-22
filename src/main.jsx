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
//
// Per-URL sessionStorage cooldown — a single global throttle was burning
// the budget on the first stale route, leaving the second navigation to
// crash the user. Per-URL means each unique failing chunk gets its own
// reload attempt (5min cooldown per URL).
const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const URL_RE = /https?:\/\/\S+?\.m?js\b/
const KEY_PREFIX = 'sid-chunk-reload:'
function maybeReload(msg) {
  if (!msg || !CHUNK_RE.test(String(msg))) return
  const m = URL_RE.exec(String(msg))
  const key = `${KEY_PREFIX}${m ? m[0] : 'unknown'}`
  const last = Number(sessionStorage.getItem(key) || '0')
  if (Date.now() - last <= 5 * 60_000) return
  sessionStorage.setItem(key, String(Date.now()))
  window.location.reload()
}
window.addEventListener('error', (e) => maybeReload(e?.message))
window.addEventListener('unhandledrejection', (e) => maybeReload(e?.reason?.message || e?.reason))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
