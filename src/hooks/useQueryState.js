import { useEffect, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * useQueryState — useState-style hook that mirrors a single piece of
 * state to a URL ?param=. Reads from the URL on mount; writes back when
 * the value changes. The default value is omitted from the URL when
 * matched, keeping URLs short.
 *
 *   const [tab, setTab] = useQueryState('tab', 'overview')
 *   const [days, setDays] = useQueryState('days', 14, { parse: Number })
 *   const [mode, setMode] = useQueryState('mode', 'play', { allowed: ['play','analyze','hvh'] })
 *
 * Options:
 *   parse:    fn(string) → value           default: identity
 *   serialize fn(value)  → string          default: String
 *   allowed:  [val, ...] whitelist         (rejects unknown URL values, falls back to default)
 *   replace:  bool, use replaceState       default: true (no history pile-up)
 */
export default function useQueryState(key, defaultValue, opts = {}) {
  const { parse = (s) => s, serialize = (v) => String(v), allowed, replace = true } = opts
  const [searchParams, setSearchParams] = useSearchParams()

  const read = () => {
    const raw = searchParams.get(key)
    if (raw == null || raw === '') return defaultValue
    try {
      const parsed = parse(raw)
      if (allowed && !allowed.includes(parsed)) return defaultValue
      return parsed
    } catch { return defaultValue }
  }

  const [value, setValue] = useState(read)

  // Re-sync when the URL changes externally (back/forward, deep link).
  useEffect(() => {
    const next = read()
    setValue(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const update = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(value) : next
    setValue(resolved)
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev)
      const serialized = serialize(resolved)
      const isDefault = serialized === serialize(defaultValue)
      if (isDefault || resolved == null || resolved === '') sp.delete(key)
      else sp.set(key, serialized)
      return sp
    }, { replace })
  }, [value, key, defaultValue, serialize, setSearchParams, replace])

  return [value, update]
}
