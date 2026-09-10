import { Component } from 'react'

/**
 * WebGLBoundary — a defensive wrapper for any Three.js / WebGL demo.
 *
 * Why this exists
 * ─────────────────
 * The prod /lab crash "Error creating WebGL context" fires when the
 * browser hits its per-tab context ceiling (Chrome caps at 8-16 live
 * contexts). Once that happens ANY subsequent `new WebGLRenderer()`
 * throws synchronously during a `useEffect` mount, which React
 * surfaces as an uncaught error — the entire page unmounts and the
 * user is left staring at the RouteErrorBoundary crash card.
 *
 * This boundary catches that specific class of failure and swaps in
 * a graceful "WebGL unavailable" panel instead of taking the whole
 * route down. It also runs a cheap feature-detect at mount time so
 * browsers that never had WebGL (locked-down corporate VMs, some
 * mobile UA overrides) skip the render entirely.
 */

// Cheap, cached feature detect. Called at module load so we only ever
// mint one probe canvas. Returns true if either webgl2 or webgl is
// available on this browser.
let _hasWebGL = null
export const hasWebGL = () => {
  if (_hasWebGL !== null) return _hasWebGL
  try {
    const c = document.createElement('canvas')
    _hasWebGL = !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
  } catch {
    _hasWebGL = false
  }
  return _hasWebGL
}

const Fallback = ({ reason }) => (
  <div className='w-full h-full min-h-[280px] flex items-center justify-center p-6'>
    <div className='max-w-sm text-center space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6'>
      <div className='inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/15 text-amber-300 text-lg font-bold'>
        3D
      </div>
      <p className='text-fg-primary font-bold text-sm'>WebGL unavailable</p>
      <p className='text-fg-muted text-xs leading-relaxed'>
        {reason || 'This demo needs a WebGL-capable browser. Try Chrome, Firefox or Safari on a device with GPU acceleration on — everything else on the page still works.'}
      </p>
    </div>
  </div>
)

export default class WebGLBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, msg: '' }
  }

  static getDerivedStateFromError(error) {
    const msg = String(error?.message || error || '')
    return { crashed: true, msg }
  }

  componentDidCatch(error, info) {
    // Log so it still shows up in Sentry / console, but don't rethrow.
    // eslint-disable-next-line no-console
    console.warn('[WebGLBoundary]', error?.message || error, info?.componentStack)
  }

  render() {
    if (!hasWebGL()) return <Fallback reason='Your browser reports no WebGL support. Enable hardware acceleration or switch to a modern browser to run this 3D demo.' />
    if (this.state.crashed) return <Fallback reason={this.state.msg || 'The browser hit its live WebGL context limit. Close a few tabs and reload.'} />
    return this.props.children
  }
}
