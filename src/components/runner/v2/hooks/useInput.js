// useInput — unified input layer for the runner.
//
// Wires three independent input sources to the same callbacks:
//   - Keyboard: ←→↑↓ / WASD / Space / Esc / P
//   - Touch swipe: directional swipes on the document
//   - MediaPipe HandLandmarker: open-palm jump, fist roll, index left/right
//
// Caller supplies onLeft/onRight/onJump/onRoll/onPause. Hand tracking is
// opt-in via `handEnabled`; it spins up the camera + MediaPipe lazily.

import { useEffect, useRef, useState } from 'react'

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

// Min swipe travel before we register a directional swipe (px).
const SWIPE_MIN = 30
// Below this travel a touchstart/touchend is treated as a tap, not a swipe.
const TAP_MAX = 8
// Repeat-debounce window for the same gesture (ms).
const GESTURE_REPEAT_MS = 250

export default function useInput({
  enabled = true,
  handEnabled = false,
  onLeft,
  onRight,
  onJump,
  onRoll,
  onPause,
} = {}) {
  // Latest callback refs so the listeners below don't need to rebind.
  const cbRef = useRef({ onLeft, onRight, onJump, onRoll, onPause })
  cbRef.current = { onLeft, onRight, onJump, onRoll, onPause }
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Hand status surfaced to the page so the HUD can render a small badge.
  const [handStatus, setHandStatus] = useState({ active: false, lastGesture: null, error: null })
  const handVideoRef = useRef(null)
  const handCleanupRef = useRef(null)

  // ── Keyboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const heldKeys = new Set()
    const onKeyDown = (e) => {
      if (heldKeys.has(e.code)) return        // ignore key-repeats while held
      heldKeys.add(e.code)
      if (!enabledRef.current) {
        // Pause is the one action that fires even when "enabled" is false
        // — the page uses that signal to toggle pause/resume.
        if (e.code === 'Escape' || e.code === 'KeyP') cbRef.current.onPause?.()
        return
      }
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA':                       cbRef.current.onLeft?.();  break
        case 'ArrowRight': case 'KeyD':                       cbRef.current.onRight?.(); break
        case 'ArrowUp':    case 'KeyW':    case 'Space':      cbRef.current.onJump?.();  e.preventDefault(); break
        case 'ArrowDown':  case 'KeyS':                       cbRef.current.onRoll?.();  break
        case 'Escape':     case 'KeyP':                       cbRef.current.onPause?.(); break
        default: break
      }
    }
    const onKeyUp = (e) => { heldKeys.delete(e.code) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [])

  // ── Touch swipe ─────────────────────────────────────────────────────
  useEffect(() => {
    let startX = 0, startY = 0
    const onStart = (e) => {
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
    }
    const onEnd = (e) => {
      if (!enabledRef.current) return
      const t = (e.changedTouches && e.changedTouches[0]) || null
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const adx = Math.abs(dx), ady = Math.abs(dy)
      // Ignore taps; they go to UI buttons.
      if (adx < TAP_MAX && ady < TAP_MAX) return
      // Determine dominant axis with a 50% bias rule.
      if (adx > ady) {
        if (adx < SWIPE_MIN) return
        if (ady > adx * 0.5) return  // too diagonal
        if (dx > 0) cbRef.current.onRight?.()
        else        cbRef.current.onLeft?.()
      } else {
        if (ady < SWIPE_MIN) return
        if (adx > ady * 0.5) return
        if (dy > 0) cbRef.current.onRoll?.()
        else        cbRef.current.onJump?.()
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [])

  // ── Hand tracking (MediaPipe HandLandmarker) ────────────────────────
  useEffect(() => {
    if (!handEnabled) {
      // Tear down if was running.
      handCleanupRef.current?.()
      handCleanupRef.current = null
      setHandStatus({ active: false, lastGesture: null, error: null })
      return
    }

    let cancelled = false
    let landmarker = null
    let stream = null
    let rafId = null
    const lastFiredAt = { left: 0, right: 0, jump: 0, roll: 0 }

    const fire = (kind) => {
      const now = performance.now()
      if (now - lastFiredAt[kind] < GESTURE_REPEAT_MS) return
      lastFiredAt[kind] = now
      setHandStatus(s => ({ ...s, active: true, lastGesture: kind }))
      if (!enabledRef.current) return
      if (kind === 'left')  cbRef.current.onLeft?.()
      if (kind === 'right') cbRef.current.onRight?.()
      if (kind === 'jump')  cbRef.current.onJump?.()
      if (kind === 'roll')  cbRef.current.onRoll?.()
    }

    // Position-based single-hand control. The hand's wrist (landmark 0)
    // is treated as a virtual joystick — we slice the camera frame into
    // five zones and fire actions on zone TRANSITIONS so a held position
    // doesn't continuously re-trigger.
    //
    //   y < 0.32     → 'up'     → onJump
    //   y > 0.72     → 'down'   → onRoll
    //   x < 0.32     → 'left'   → onLeft   (user's real-world left)
    //   x > 0.68     → 'right'  → onRight  (user's real-world right)
    //   otherwise    → 'center' → idle (acts as a reset between triggers)
    //
    // MediaPipe coords are NOT pre-mirrored. The selfie-view we render
    // for the preview only flips the on-screen pixels, not the landmark
    // x. So user's physical-left hand has small x in MP coords → onLeft,
    // user's physical-right hand has large x → onRight. Feels natural
    // because the user moves THEIR hand left/right, not the on-screen
    // mirror image.
    const X_LEFT_MAX  = 0.32
    const X_RIGHT_MIN = 0.68
    const Y_UP_MAX    = 0.32
    const Y_DOWN_MIN  = 0.72

    let lastZone = 'center'

    const classifyZone = (landmarks) => {
      const wrist = landmarks[0]
      if (!wrist) return 'center'
      // Y first so a raised hand at the edge still reads as 'up' rather
      // than 'left' (more intuitive — vertical wins over horizontal when
      // both fire).
      if (wrist.y < Y_UP_MAX)    return 'up'
      if (wrist.y > Y_DOWN_MIN)  return 'down'
      if (wrist.x < X_LEFT_MAX)  return 'left'
      if (wrist.x > X_RIGHT_MIN) return 'right'
      return 'center'
    }

    const tickFrame = async () => {
      if (cancelled || !landmarker || !handVideoRef.current) return
      const video = handVideoRef.current
      if (video.readyState >= 2) {
        const ts = performance.now()
        try {
          const result = landmarker.detectForVideo(video, ts)
          let zone = 'center'
          if (result?.landmarks?.length) {
            zone = classifyZone(result.landmarks[0])
          }
          // Fire only on the zone TRANSITION — entering a directional
          // zone from anywhere else triggers the action. Returning to
          // 'center' is silent and just re-arms the trigger.
          if (zone !== lastZone) {
            lastZone = zone
            if (zone === 'up')    fire('jump')
            else if (zone === 'down')  fire('roll')
            else if (zone === 'left')  fire('left')
            else if (zone === 'right') fire('right')
          }
          // Expose the current zone on handStatus so the HUD preview can
          // show "left" / "right" / "up" / "down" / "center" live.
          setHandStatus(s => s.lastGesture === zone ? s : { ...s, active: true, lastGesture: zone })
        } catch {}
      }
      rafId = requestAnimationFrame(tickFrame)
    }

    ;(async () => {
      try {
        // Lazy load MediaPipe — it's a heavy CDN dependency.
        const vision = await import('@mediapipe/tasks-vision')
        const { FilesetResolver, HandLandmarker } = vision
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
        if (cancelled) return
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        if (cancelled) return
        // Request webcam.
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        if (handVideoRef.current) {
          handVideoRef.current.srcObject = stream
          handVideoRef.current.muted = true
          await handVideoRef.current.play()
        }
        setHandStatus({ active: true, lastGesture: null, error: null })
        tickFrame()
      } catch (err) {
        if (!cancelled) setHandStatus({ active: false, lastGesture: null, error: err?.message || 'Hand tracking failed' })
      }
    })()

    const cleanup = () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      try { landmarker?.close?.() } catch {}
      try { stream?.getTracks().forEach(t => t.stop()) } catch {}
      if (handVideoRef.current) handVideoRef.current.srcObject = null
    }
    handCleanupRef.current = cleanup
    return cleanup
  }, [handEnabled])

  return { handStatus, handVideoRef }
}
