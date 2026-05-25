// Global notice store — replaces antd `message.*` toasts site-wide.
//
// Why: antd's `message` API renders a tiny top-center toast that
// auto-dismisses after ~3s. The user wanted something more
// substantial that they can read at their own pace and dismiss
// explicitly. This module backs a top-right stack of antd Alert
// cards (rendered by <NoticeStack> in App.jsx) that any component
// can push to via `notice.success / .error / .warning / .info`.
//
// API mirrors antd's message so the migration is a search-and-
// replace: change `antMessage.success("msg")` to `notice.success("msg")`.
//
// Defaults:
//   success / info  → auto-dismiss after 6s
//   warning         → auto-dismiss after 10s
//   error           → STICKY (no auto-dismiss) — errors deserve the user's eye
//
// Override per-call:  notice.success("msg", { duration: 0 })   // sticky
//                     notice.error("msg",   { duration: 4 })   // override
//
// No external store dep — a hand-rolled pub-sub keeps the bundle small.

let _id = 0
let _items = []        // [{ id, type, text, duration }]
const _listeners = new Set()

function _emit() {
  for (const fn of _listeners) fn(_items)
}

function _push(type, text, opts = {}) {
  if (text == null || text === '') return null
  const safeText = typeof text === 'string' ? text : String(text)
  const duration = typeof opts.duration === 'number'
    ? opts.duration
    : (type === 'error' ? 0 : type === 'warning' ? 10 : 6)
  const id = ++_id
  _items = [..._items, { id, type, text: safeText, duration }]
  _emit()
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration * 1000)
  }
  return id
}

export function dismiss(id) {
  const before = _items.length
  _items = _items.filter(n => n.id !== id)
  if (_items.length !== before) _emit()
}

export function dismissAll() {
  if (_items.length === 0) return
  _items = []
  _emit()
}

export function subscribe(fn) {
  _listeners.add(fn)
  fn(_items)   // emit current state immediately
  return () => _listeners.delete(fn)
}

// Public API — drop-in for antd `message.*`.
export const notice = {
  success: (text, opts) => _push('success', text, opts),
  error:   (text, opts) => _push('error',   text, opts),
  warning: (text, opts) => _push('warning', text, opts),
  info:    (text, opts) => _push('info',    text, opts),
}
