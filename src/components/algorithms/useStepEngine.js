// useStepEngine — universal play/pause/step animation driver.
//
// Sibling agents drive their visualisers off a `frames` array. This
// hook owns the "which frame is on-screen right now" state, plus
// play/pause/step semantics + a speed multiplier.
//
// Usage:
//   const frames = useMemo(() => planKnapsack(items, cap), [items, cap])
//   const { i, playing, play, pause, step, reset, speed, setSpeed }
//     = useStepEngine({ frameCount: frames.length, onFrame: setIdx })
//   const current = frames[i]
//
// Returned methods:
//   play()      — start (idempotent)
//   pause()     — stop advancing
//   step(dir=+1)— jump one frame in dir (also usable as onStep from StepControls)
//   reset()     — back to frame 0
//   setSpeed(n) — 0.25 .. 4
//
// Notes:
//   * On play, tick period = 500ms / speed. speed=1 → one frame every
//     500ms; speed=4 → 125ms; speed=0.25 → 2s.
//   * Auto-pauses when we reach the last frame.
//   * `onFrame` fires on every mutation of i, useful when the caller
//     wants to mirror the index into some other state (rarely needed).
//   * Respects `prefers-reduced-motion` by defaulting to no auto-play.

import { useCallback, useEffect, useRef, useState } from 'react'

export default function useStepEngine({ frameCount = 0, onFrame, initialSpeed = 1 } = {}) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(initialSpeed)
  const iRef = useRef(0)
  const rafRef = useRef(0)
  const lastTickRef = useRef(0)

  useEffect(() => { iRef.current = i; onFrame?.(i) }, [i, onFrame])

  // Clamp on frame count change.
  useEffect(() => {
    if (frameCount === 0) { setI(0); iRef.current = 0; return }
    if (iRef.current >= frameCount) { setI(frameCount - 1); iRef.current = frameCount - 1 }
  }, [frameCount])

  // Play loop — rAF-based so it stays in sync with the display and pauses
  // when the tab is backgrounded.
  useEffect(() => {
    if (!playing) return
    if (frameCount === 0) { setPlaying(false); return }
    const period = 500 / Math.max(0.1, speed)
    lastTickRef.current = performance.now()
    const tick = (now) => {
      if (now - lastTickRef.current >= period) {
        lastTickRef.current = now
        const next = iRef.current + 1
        if (next >= frameCount) {
          setI(frameCount - 1)
          setPlaying(false)
          return
        }
        setI(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, frameCount])

  const play  = useCallback(() => {
    if (frameCount === 0) return
    if (iRef.current >= frameCount - 1) { setI(0); iRef.current = 0 }
    setPlaying(true)
  }, [frameCount])
  const pause = useCallback(() => setPlaying(false), [])
  const step  = useCallback((dir = 1) => {
    setPlaying(false)
    setI((v) => {
      const nxt = Math.max(0, Math.min(frameCount - 1, v + dir))
      return nxt
    })
  }, [frameCount])
  const reset = useCallback(() => { setPlaying(false); setI(0); iRef.current = 0 }, [])

  return { i, playing, play, pause, step, reset, speed, setSpeed }
}
