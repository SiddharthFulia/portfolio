import { Component } from 'react'

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
    console.error('[RouteErrorBoundary]', error)
    if (info?.componentStack) console.error(info.componentStack)
  }

  reset = () => this.setState({ error: null, info: null })

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen bg-black text-gray-100 pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto rounded-2xl border border-rose-500/40 bg-rose-500/5 p-6">
          <h2 className="text-rose-300 text-lg font-semibold mb-2">
            This page crashed — here's the error so it's not a blank screen
          </h2>
          <p className="text-rose-200/90 text-sm font-mono break-all mb-4">
            {String(error?.message || error)}
          </p>
          {info?.componentStack && (
            <details className="text-xs text-gray-400 mb-4">
              <summary className="cursor-pointer text-gray-300 mb-1">Component stack</summary>
              <pre className="whitespace-pre-wrap font-mono leading-snug">{info.componentStack}</pre>
            </details>
          )}
          <button onClick={this.reset}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-sm">
            Try again
          </button>
        </div>
      </div>
    )
  }
}
