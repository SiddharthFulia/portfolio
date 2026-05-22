import { Component } from 'react'
import PageLoader from './PageLoader'
import { tryChunkReload, CHUNK_RE } from '../App'

// Last-line-of-defense error boundary for route-level crashes. For
// chunk-fetch failures specifically (Vite/Vercel deploy race) we hide
// the scary red UI and render the antd-skeleton PageLoader while we
// silently retry the reload. The lazyWithReload .catch should have
// already fired — this is only reached if the per-URL cooldown blocked
// the reload AND the throw bubbled up. We still try once more here so
// the user never sees a crash for a known-recoverable failure.

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    const msg = error?.message || String(error)
    console.error('[RouteErrorBoundary]', error)
    if (info?.componentStack) console.error(info.componentStack)
    // If this is a deploy-race chunk error, try reloading one more time.
    // tryChunkReload respects its own per-URL cooldown so we won't loop.
    if (CHUNK_RE.test(msg)) tryChunkReload(error)
  }

  reset = () => this.setState({ error: null, info: null })

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    const msg = String(error?.message || error)
    const isChunkError = CHUNK_RE.test(msg)

    // Soft path — render the same loading skeleton the rest of the site
    // uses. If the reload landed, the user never sees this at all; if
    // it didn't (cooldown blocked, network down), the skeleton at least
    // doesn't look like a crash.
    if (isChunkError) {
      return <PageLoader />
    }

    // Real crash — show the diagnostic UI so it's not a blank screen.
    return (
      <div className="min-h-screen bg-black text-gray-100 pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto rounded-2xl border border-rose-500/40 bg-rose-500/5 p-6">
          <h2 className="text-rose-300 text-lg font-semibold mb-2">
            This page crashed — here's the error so it's not a blank screen
          </h2>
          <p className="text-rose-200/90 text-sm font-mono break-all mb-4">{msg}</p>
          {info?.componentStack && (
            <details className="text-xs text-gray-400 mb-4">
              <summary className="cursor-pointer text-gray-300 mb-1">Component stack</summary>
              <pre className="whitespace-pre-wrap font-mono leading-snug">{info.componentStack}</pre>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={this.reset}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-sm">
              Try again
            </button>
            <button onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm">
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
