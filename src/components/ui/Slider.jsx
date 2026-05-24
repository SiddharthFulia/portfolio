// <Slider> — site-wide slider component (antd-based).
//
// Wraps antd's <Slider> so every page uses the same chrome, and an
// `accent` prop picks the project's familiar colour family without
// re-implementing the CSS each time.
//
// Usage:
//   import Slider from '../components/ui/Slider'
//   <Slider min={0} max={100} value={n} onChange={setN} />
//   <Slider accent="violet" min={1} max={10} value={x} onChange={setX} />
//   <Slider range value={[a, b]} onChange={setRange} accent="amber" />
//
// Why a wrapper:
//   - antd's default track / handle / mark colours are the antd blue —
//     out of place against the dark amber/violet/rose palette. We
//     override via inline styles instead of !important CSS so the
//     overrides don't bleed into other antd components.
//   - Consistent dot + handle sizing across the site (12px handle,
//     2px-thick track).
//   - Pulls in the same `tooltip` formatter behaviour everywhere so
//     drag-readouts feel uniform.
//
// All other antd Slider props pass through (range, dots, marks, step,
// included, tooltip, vertical, reverse, disabled, …).

import { Slider as AntSlider } from 'antd'

const ACCENTS = {
  amber:    { color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.35)' },
  rose:     { color: '#fb7185', glow: 'rgba(251, 113, 133, 0.35)' },
  fuchsia:  { color: '#e879f9', glow: 'rgba(232, 121, 249, 0.35)' },
  violet:   { color: '#a78bfa', glow: 'rgba(167, 139, 250, 0.35)' },
  cyan:     { color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.35)' },
  emerald:  { color: '#34d399', glow: 'rgba(52, 211, 153, 0.35)' },
  gray:     { color: '#9ca3af', glow: 'rgba(156, 163, 175, 0.35)' },
}

export default function Slider({
  accent = 'amber',
  styles: callerStyles,                   // allow per-instance override
  className = '',
  ...rest
}) {
  const a = ACCENTS[accent] || ACCENTS.amber
  // antd 5+ exposes a `styles` API for per-part styling. Track =
  // the filled portion; handle = the draggable knob. Rail (unfilled
  // portion) stays the antd default since it works on dark surfaces.
  const styles = {
    track:  { background: a.color, ...callerStyles?.track },
    tracks: { background: a.color, ...callerStyles?.tracks },   // for `range`
    handle: {
      borderColor: a.color,
      boxShadow:   `0 0 0 4px ${a.glow}`,
      ...callerStyles?.handle,
    },
    rail:   { background: 'rgba(255, 255, 255, 0.10)', ...callerStyles?.rail },
  }
  return (
    <AntSlider
      styles={styles}
      className={className}
      {...rest}
    />
  )
}
