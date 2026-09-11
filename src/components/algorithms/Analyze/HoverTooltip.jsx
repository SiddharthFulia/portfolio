// HoverTooltip — floating value bubble anchored to a variable identifier
// in the code panel. Rendered by the Analyze index; it manages its own
// screen positioning so we don't fight z-index with the code's overflow.

import { useEffect, useState } from 'react'

export default function HoverTooltip({ x, y, name, value }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (name != null) {
      // Delay show slightly to avoid flicker on mouse drag.
      const t = setTimeout(() => setVisible(true), 60)
      return () => clearTimeout(t)
    }
    setVisible(false)
    return undefined
  }, [name])

  if (!name || !visible) return null

  // Clamp x/y so the tooltip stays on screen.
  const left = Math.max(8, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1024) - 320, x + 12))
  const top  = Math.max(8, y - 44)

  return (
    <div
      role="tooltip"
      style={{ position: 'fixed', left, top, zIndex: 60, pointerEvents: 'none' }}
      className="rounded-md border border-amber-400/40 bg-black/90 shadow-lg shadow-black/40 px-2.5 py-1.5 text-[11px] font-mono max-w-[280px]"
    >
      <div className="text-amber-300 font-bold">{name}</div>
      <div className="text-gray-200 break-all">
        {value == null ? <span className="text-gray-500 italic">not defined at this step</span> : value}
      </div>
    </div>
  )
}
