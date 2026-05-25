// NoticeStack — renders the global notice queue as a stack of antd
// Alert cards in the top-right of the viewport. Mounted once in
// App.jsx so every page shares the same surface.
//
// Auto-dismiss is timer-based inside the store; this component is
// pure render + click-to-dismiss. Stacks vertically, top item is the
// newest. Caps the visible count at 6 so a runaway error loop can't
// blanket the screen — older items get scrolled into an overflow.
//
// Below md the stack collapses to full-width at the very top of the
// viewport so phones don't have a half-screen Alert dangling.

import { useEffect, useState } from 'react'
import { Alert } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { subscribe, dismiss } from '../lib/notice'

export default function NoticeStack() {
  const [items, setItems] = useState([])
  useEffect(() => subscribe(setItems), [])

  if (items.length === 0) return null

  // Newest at the top — reverse so the latest call shows first.
  const ordered = [...items].reverse()
  // Cap the visible stack so an error loop can't take the screen
  // hostage; everything beyond the cap stays in the store (still
  // counts toward the +N indicator) but doesn't render.
  const VISIBLE_CAP = 6
  const visible = ordered.slice(0, VISIBLE_CAP)
  const overflow = ordered.length - visible.length

  return (
    <div
      className="
        fixed z-[9999] pointer-events-none
        top-2 left-2 right-2
        md:top-20 md:left-auto md:right-4 md:w-[380px]
        space-y-2
      "
      role="status"
      aria-live="polite"
    >
      {visible.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <Alert
            type={n.type}
            message={<span className="font-medium leading-snug break-words">{n.text}</span>}
            showIcon
            closable
            closeIcon={<CloseOutlined />}
            onClose={() => dismiss(n.id)}
            className="shadow-elevated"
          />
        </div>
      ))}
      {overflow > 0 && (
        <p className="pointer-events-none text-[10px] font-mono text-fg-muted text-center">
          + {overflow} more
        </p>
      )}
    </div>
  )
}
