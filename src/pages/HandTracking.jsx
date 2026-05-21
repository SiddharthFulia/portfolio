import { useEffect, useRef, useState } from 'react'
import { Button, Tooltip, Slider } from 'antd'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined, DownloadOutlined,
  EyeOutlined, HighlightOutlined, AimOutlined, ClearOutlined,
} from '@ant-design/icons'
import notify from '../utils/notify'

// Hand-tracking page. MediaPipe HandLandmarker runs in WebAssembly on
// the user's machine — no BE round-trip, ~30-60fps on modern hardware.
// Three modes:
//   • View   — just renders the 21-point skeleton over the webcam feed
//   • Draw   — pinch index + thumb to lay down a stroke on the canvas
//   • Cursor — index fingertip moves a virtual cursor; pinch = click

// The MediaPipe wasm bundle + the .task model are loaded from Google's
// jsDelivr CDN. ~5 MB on first hit, cached aggressively afterwards.
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

// Bone-pair connections between the 21 hand landmarks. Used to draw the
// skeleton lines. (MediaPipe's official HAND_CONNECTIONS table.)
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],  // pinky + palm
]
const FINGERTIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 }

const COLORS = [
  '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399',
  '#f87171', '#60a5fa', '#ffffff', '#0f172a',
]

// Cursor visual presets — purely CSS / SVG, no model change. Each renders
// inside the same fixed-position element so only `class` + content swap.
const CURSORS = [
  { id: 'bullseye',  label: '🎯 Bullseye', accent: '#fbbf24' },
  { id: 'dot',       label: '⚪ Dot',       accent: '#22d3ee' },
  { id: 'ring',      label: '⭕ Ring',      accent: '#a78bfa' },
  { id: 'crosshair', label: '✚ Crosshair', accent: '#34d399' },
  { id: 'star',      label: '⭐ Star',      accent: '#fde047' },
  { id: 'sparkle',   label: '✨ Sparkle',   accent: '#f472b6' },
  { id: 'laser',     label: '🔴 Laser',     accent: '#f87171' },
]

// Renders the active cursor's visual. `state` is 'idle' | 'click' so each
// style can react to the pinch (e.g. pulse, recolor, scale).
function CursorVisual({ id, accent, state }) {
  const clicking = state === 'click'
  const common = `transition-transform duration-100 ${clicking ? 'scale-150' : ''}`
  if (id === 'bullseye') {
    return (
      <svg viewBox="0 0 24 24" className={`w-7 h-7 ${common}`}>
        <circle cx="12" cy="12" r="10" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.55" />
        <circle cx="12" cy="12" r="6"  fill="none" stroke={accent} strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.5" fill={clicking ? '#fff' : accent} />
      </svg>
    )
  }
  if (id === 'dot') {
    return <div className={`w-5 h-5 rounded-full ${common}`}
      style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
  }
  if (id === 'ring') {
    return <div className={`w-7 h-7 rounded-full border-[3px] ${common}`}
      style={{ borderColor: accent, background: clicking ? `${accent}55` : 'transparent' }} />
  }
  if (id === 'crosshair') {
    return (
      <svg viewBox="0 0 24 24" className={`w-8 h-8 ${common}`}>
        <line x1="12" y1="2" x2="12" y2="22" stroke={accent} strokeWidth="1.5" />
        <line x1="2" y1="12" x2="22" y2="12" stroke={accent} strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3" fill="none" stroke={accent} strokeWidth="1.5" />
        {clicking && <circle cx="12" cy="12" r="1.5" fill={accent} />}
      </svg>
    )
  }
  if (id === 'star') {
    return (
      <svg viewBox="0 0 24 24" className={`w-7 h-7 drop-shadow-[0_0_6px_currentColor] ${common}`}
        style={{ color: accent }}>
        <path d="M12 2 L14 9 L22 10 L16 14 L18 22 L12 18 L6 22 L8 14 L2 10 L10 9 Z"
          fill={accent} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      </svg>
    )
  }
  if (id === 'sparkle') {
    return (
      <svg viewBox="0 0 24 24" className={`w-8 h-8 ${common}`}>
        <path d="M12 3 L13 11 L21 12 L13 13 L12 21 L11 13 L3 12 L11 11 Z"
          fill={accent} />
        {clicking && <circle cx="12" cy="12" r="3" fill="white" opacity="0.7" />}
      </svg>
    )
  }
  // laser
  return (
    <div className={`relative w-5 h-5 ${common}`}>
      <div className="absolute inset-0 rounded-full"
        style={{ background: accent, boxShadow: `0 0 18px 6px ${accent}, 0 0 4px 1px #fff inset` }} />
      {clicking && <div className="absolute -inset-2 rounded-full border-2 animate-ping"
        style={{ borderColor: accent }} />}
    </div>
  )
}

// Euclidean distance between two normalized landmarks (x, y in [0,1]).
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Detect a pinch — thumb tip + index tip within a small radius.
// Threshold is in normalized image coordinates; ~0.05 is a tight pinch.
const isPinching = (lm) => lm && dist(lm[4], lm[8]) < 0.055

// Classify the 4 hand gestures used by the Filters mode. Returns one of
// 'fist' | 'peace' | 'point' | 'open' | null. Order matters — peace must
// be matched before "point" since both have the index finger up.
const classifyGesture = (fingers) => {
  if (!fingers) return null
  const { thumb, index, middle, ring, pinky } = fingers
  const up = [thumb, index, middle, ring, pinky].filter(Boolean).length
  if (up === 0) return 'fist'
  if (index && middle && !ring && !pinky) return 'peace'
  if (index && !middle && !ring && !pinky) return 'point'
  if (up >= 4) return 'open'
  return null
}

// Paint the active filter onto the overlay canvas. Coordinates are in
// canvas pixels in the MIRRORED frame (so they line up with what the
// user sees on-screen). `t` is millis since the page mounted.
function drawFilter(ctx, kind, tipX, tipY, W, H, t) {
  if (kind === 'fist') {
    // Dither — diagonal cross-hatch + slight darken so the camera looks
    // posterized. Cheap to render and reads as 'pixel art'.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    const step = 7
    for (let y = 0; y < H; y += step) {
      const offset = ((y / step) | 0) % 2 === 0 ? 0 : step / 2
      for (let x = offset; x < W; x += step) ctx.fillRect(x, y, 2, 2)
    }
  }
  else if (kind === 'peace') {
    // VHS feel — magenta wash, moving glitch band, fine scanlines.
    // Chromatic aberration on the camera RGB is applied via the SVG
    // filter on the <video> element when this gesture is active.
    ctx.fillStyle = 'rgba(255, 30, 120, 0.06)'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.lineWidth = 1
    const offset = (t / 30) % 4
    for (let y = offset; y < H; y += 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    const bandY = (t / 4) % H
    ctx.fillStyle = 'rgba(0, 255, 255, 0.12)'
    ctx.fillRect(0, bandY, W, 24)
    // "VHS" / "REC" badge
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = '#ef4444'
    ctx.fillText('● REC', 12, H - 14)
  }
  else if (kind === 'point') {
    // Spotlight — everything dimmed except a circle around the tip.
    const grad = ctx.createRadialGradient(tipX, tipY, 25, tipX, tipY, Math.max(W, H) * 0.55)
    grad.addColorStop(0,    'rgba(0, 0, 0, 0)')
    grad.addColorStop(0.18, 'rgba(0, 0, 0, 0)')
    grad.addColorStop(1,    'rgba(0, 0, 0, 0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    ctx.beginPath()
    ctx.arc(tipX, tipY, 26, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.95)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  else if (kind === 'open') {
    // Water ripple — concentric circles expand from the index tip.
    for (let i = 0; i < 4; i++) {
      const r = ((t / 6) + i * 70) % 320
      const alpha = Math.max(0, 1 - r / 320)
      ctx.beginPath()
      ctx.arc(tipX, tipY, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(125, 211, 252, ${alpha * 0.7})`
      ctx.lineWidth = 3
      ctx.stroke()
    }
    // Soft blue tint for the "underwater" feel
    ctx.fillStyle = 'rgba(56, 189, 248, 0.06)'
    ctx.fillRect(0, 0, W, H)
  }
}

// Which fingers are extended? Each finger uses the "tip above the
// middle joint" heuristic in normalized image space.
const fingersUp = (lm) => {
  if (!lm) return { thumb: false, index: false, middle: false, ring: false, pinky: false }
  const tipY = (i, mcp) => lm[i].y < lm[mcp].y
  const tipX = (i, mcp) => Math.abs(lm[i].x - lm[mcp].x) > 0.04
  return {
    thumb:  tipX(4, 2),
    index:  tipY(8, 6),
    middle: tipY(12, 10),
    ring:   tipY(16, 14),
    pinky:  tipY(20, 18),
  }
}

export default function HandTracking() {
  const videoRef    = useRef(null)
  const overlayRef  = useRef(null)   // skeleton — cleared every frame
  const canvasRef   = useRef(null)   // drawing  — persistent
  const cursorRef   = useRef(null)   // virtual cursor element
  const landmarkerRef = useRef(null)
  const rafRef      = useRef(null)
  const streamRef   = useRef(null)
  const lastDrawPt  = useRef(null)
  const lastClickAt = useRef(0)

  const [ready, setReady]   = useState(false)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState('view')        // view | draw | cursor | filters
  const [color, setColor] = useState(COLORS[0])
  const [brush, setBrush] = useState(6)
  const [fps, setFps] = useState(0)
  const [gestures, setGestures] = useState(null)  // { handed, fingers, pinch }
  const [activeFilter, setActiveFilter] = useState(null) // detected gesture in filters mode
  const [cursorStyle, setCursorStyle] = useState('bullseye')
  const [error, setError] = useState(null)
  // Used by the spotlight filter — needs the most recent index-tip in
  // canvas pixel coords; updated each frame inside the RAF loop.
  const filterStateRef = useRef({ tip: null, openCenter: null, t0: performance.now() })

  useEffect(() => { document.title = 'Hand Tracking · Sid' }, [])

  // Load MediaPipe HandLandmarker once on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
        const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
        const lm = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) { lm.close?.(); return }
        landmarkerRef.current = lm
        setReady(true)
      } catch (e) {
        setError(`Couldn't load MediaPipe: ${e.message}`)
      }
    })()
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      landmarkerRef.current?.close?.()
    }
  }, [])

  // Resize the canvases when the video frame metadata arrives so the
  // overlay pixels line up 1:1 with the camera feed.
  const syncCanvasSize = () => {
    const v = videoRef.current
    if (!v) return
    const w = v.videoWidth, h = v.videoHeight
    for (const c of [overlayRef.current, canvasRef.current]) {
      if (!c) continue
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    }
  }

  const start = async () => {
    if (!ready || running) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setRunning(true); setError(null)
      loop()
    } catch (e) {
      setError(`Camera blocked: ${e.message}`)
      notify.error(e.message, { title: 'Camera unavailable' })
    }
  }

  const stop = () => {
    setRunning(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const clearDrawing = () => {
    const c = canvasRef.current; if (!c) return
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    lastDrawPt.current = null
    notify.info('Canvas cleared', { title: 'Cleared' })
  }

  const saveDrawing = () => {
    const c = canvasRef.current; if (!c) return
    const url = c.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url; a.download = `hand-drawing-${Date.now()}.png`
    document.body.appendChild(a); a.click(); a.remove()
    notify.success('Drawing saved as PNG', { title: 'Downloaded' })
  }

  // Cursor mode: dispatch a synthetic click at viewport coords.
  const fireClickAt = (clientX, clientY) => {
    const now = Date.now()
    if (now - lastClickAt.current < 600) return   // debounce 600ms
    lastClickAt.current = now
    const el = document.elementFromPoint(clientX, clientY)
    if (el && el !== cursorRef.current) {
      el.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX, clientY,
      }))
    }
  }

  // Main per-frame work: detect → draw skeleton → handle mode-specific
  // interactions. Re-schedules itself via requestAnimationFrame.
  let lastT = performance.now()
  const loop = () => {
    if (!running) {} // 'running' state read via closure; the cancel
                     // above stops the chain
    rafRef.current = requestAnimationFrame(loop)
    const lm = landmarkerRef.current
    const v = videoRef.current
    if (!lm || !v || v.readyState < 2) return
    syncCanvasSize()

    const now = performance.now()
    const dt = now - lastT
    lastT = now
    if (dt > 0) setFps((prev) => prev * 0.85 + (1000 / dt) * 0.15)

    let res
    try { res = lm.detectForVideo(v, now) } catch { return }
    const overlay = overlayRef.current?.getContext('2d')
    if (!overlay) return
    overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height)
    // Mirror — webcam feed is mirrored visually so the overlay must be
    // too. We mirror the canvas instead of flipping every coord.
    overlay.save()
    overlay.translate(overlay.canvas.width, 0)
    overlay.scale(-1, 1)

    const hands = res?.landmarks || []
    const W = overlay.canvas.width, H = overlay.canvas.height

    const summary = hands.map((pts, i) => {
      const fingers = fingersUp(pts)
      const pinch = isPinching(pts)
      if (mode === 'filters') {
        // Filters mode shows ONLY a single white dot on the index tip —
        // no skeleton, no fingertip dots. The visual focus belongs to
        // the gesture-driven filter overlay drawn below.
        overlay.fillStyle = '#fff'
        overlay.beginPath()
        overlay.arc(pts[8].x * W, pts[8].y * H, 9, 0, Math.PI * 2)
        overlay.fill()
        overlay.lineWidth = 2.5
        overlay.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        overlay.beginPath()
        overlay.arc(pts[8].x * W, pts[8].y * H, 15, 0, Math.PI * 2)
        overlay.stroke()
      } else {
        // Full skeleton (View / Draw / Cursor modes).
        overlay.lineWidth = 3
        overlay.strokeStyle = pinch ? '#fbbf24' : '#22d3ee'
        overlay.beginPath()
        for (const [a, b] of HAND_BONES) {
          overlay.moveTo(pts[a].x * W, pts[a].y * H)
          overlay.lineTo(pts[b].x * W, pts[b].y * H)
        }
        overlay.stroke()
        overlay.fillStyle = '#fff'
        for (const p of pts) {
          overlay.beginPath()
          overlay.arc(p.x * W, p.y * H, 4, 0, Math.PI * 2)
          overlay.fill()
        }
        const tipPalette = ['#fbbf24', '#22d3ee', '#a78bfa', '#f472b6', '#34d399']
        Object.values(FINGERTIPS).forEach((idx, i) => {
          overlay.fillStyle = tipPalette[i]
          overlay.beginPath()
          overlay.arc(pts[idx].x * W, pts[idx].y * H, 7, 0, Math.PI * 2)
          overlay.fill()
        })
      }
      return { hand: res?.handednesses?.[i]?.[0]?.categoryName || 'Hand', fingers, pinch }
    })

    overlay.restore()
    setGestures(summary[0] || null)

    // Filters mode → classify the gesture + paint the matching effect
    // OUTSIDE the mirror transform (so coords match what the user sees).
    if (mode === 'filters') {
      const g = hands.length > 0 ? classifyGesture(summary[0].fingers) : null
      if (g !== activeFilter) setActiveFilter(g)
      if (g && hands.length > 0) {
        // Index-tip pixel coords in mirrored (visible) space
        const tipX = (1 - hands[0][8].x) * W
        const tipY = hands[0][8].y * H
        const t = performance.now() - filterStateRef.current.t0
        drawFilter(overlay, g, tipX, tipY, W, H, t)
      }
    } else if (activeFilter) {
      setActiveFilter(null)
    }

    // ── Mode-specific behaviour ──
    if (mode === 'draw' && hands.length > 0) {
      const lm0 = hands[0]
      // Drawing fires while index + thumb are pinched (clear, easy gesture)
      const pinching = isPinching(lm0)
      if (pinching) {
        const ctx = canvasRef.current.getContext('2d')
        // Midpoint between thumb-tip and index-tip = pen tip
        const px = ((lm0[4].x + lm0[8].x) / 2) * canvasRef.current.width
        const py = ((lm0[4].y + lm0[8].y) / 2) * canvasRef.current.height
        // Mirror the X so the drawing matches what the user sees
        const mx = canvasRef.current.width - px
        const my = py
        ctx.strokeStyle = color
        ctx.lineWidth = brush
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (lastDrawPt.current) {
          ctx.beginPath()
          ctx.moveTo(lastDrawPt.current.x, lastDrawPt.current.y)
          ctx.lineTo(mx, my)
          ctx.stroke()
        }
        lastDrawPt.current = { x: mx, y: my }
      } else {
        lastDrawPt.current = null
      }
    }

    if (mode === 'cursor' && hands.length > 0 && cursorRef.current) {
      const lm0 = hands[0]
      // Index fingertip = cursor position, in viewport coords.
      // Map normalized landmark → viewport via the video's bounding box.
      const rect = v.getBoundingClientRect()
      // Mirror X (camera-facing UX feels natural this way)
      const x = rect.left + (1 - lm0[8].x) * rect.width
      const y = rect.top + lm0[8].y * rect.height
      cursorRef.current.style.transform = `translate(${x}px, ${y}px)`
      if (isPinching(lm0)) {
        cursorRef.current.dataset.state = 'click'
        fireClickAt(x, y)
      } else {
        cursorRef.current.dataset.state = 'idle'
      }
    }
  }

  // Restart the RAF loop whenever mode/running flip — closure captures
  // need fresh references to the mode + run state.
  useEffect(() => {
    if (!running) return
    lastT = performance.now()
    loop()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode, color, brush])

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                          bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-fuchsia-500/20
                          border border-cyan-500/30 text-[10px] uppercase tracking-wider
                          text-cyan-200 font-semibold mb-3">
            ✋ Hand tracking · MediaPipe (in-browser, no upload)
          </div>
          <h1 className="text-3xl sm:text-5xl font-black leading-tight pb-1
                         bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300
                         bg-clip-text text-transparent">
            Track hands, draw with your finger
          </h1>
          <p className="text-gray-400 text-sm sm:text-base mt-2 max-w-2xl mx-auto leading-relaxed">
            21-point hand skeleton via MediaPipe HandLandmarker. Three modes:
            inspect the bones, draw on a canvas by pinching your index +
            thumb, or pilot a virtual cursor over the page.
          </p>
        </header>

        {/* Mode chips — top-level tabs for the page */}
        <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
          {[
            { id: 'view',    icon: <EyeOutlined />,       label: 'Skeleton',  color: 'from-cyan-500 to-blue-500' },
            { id: 'draw',    icon: <HighlightOutlined />, label: 'Draw',      color: 'from-violet-500 to-fuchsia-500' },
            { id: 'cursor',  icon: <AimOutlined />,       label: 'Cursor',    color: 'from-amber-400 to-rose-500' },
            { id: 'filters', icon: <span>✨</span>,        label: 'Filters',   color: 'from-pink-500 via-fuchsia-500 to-cyan-500' },
          ].map(m => {
            const active = mode === m.id
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                            border-2 transition-all ${
                  active
                    ? `border-transparent bg-gradient-to-r ${m.color} text-white shadow-md`
                    : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}>
                {m.icon} {m.label}
              </button>
            )
          })}
        </div>

        {/* SVG filter defs — used by the VHS gesture (peace sign) to
            slightly shift the camera's RGB channels for that
            chromatic-aberration look. The CSS filter URL below references
            it. Defs only need to exist once in the document. */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <filter id="hand-vhs" x="-5%" y="-5%" width="110%" height="110%">
              <feColorMatrix in="SourceGraphic" type="matrix" result="r"
                values="1 0 0 0 0   0 0 0 0 0   0 0 0 0 0   0 0 0 1 0" />
              <feColorMatrix in="SourceGraphic" type="matrix" result="g"
                values="0 0 0 0 0   0 1 0 0 0   0 0 0 0 0   0 0 0 1 0" />
              <feColorMatrix in="SourceGraphic" type="matrix" result="b"
                values="0 0 0 0 0   0 0 0 0 0   0 0 1 0 0   0 0 0 1 0" />
              <feOffset in="r" dx="3"  dy="0" result="ro" />
              <feOffset in="b" dx="-3" dy="0" result="bo" />
              <feBlend in="g" in2="ro" mode="screen" result="rg" />
              <feBlend in="rg" in2="bo" mode="screen" />
            </filter>
          </defs>
        </svg>

        {/* Video stage */}
        <div className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gray-950 shadow-xl shadow-black/40">
          <video ref={videoRef}
            className="w-full h-auto block"
            style={{
              transform: 'scaleX(-1)',
              // Chromatic aberration only when peace sign drives the
              // VHS filter — keeps the camera clean otherwise.
              filter: (mode === 'filters' && activeFilter === 'peace') ? 'url(#hand-vhs)' : 'none',
            }}
            playsInline muted />
          <canvas ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Status pill */}
          <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-2.5 py-1
                          rounded-full bg-gray-950/85 border border-gray-700 text-[10px] font-mono">
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            {running ? `${fps.toFixed(0)} fps` : ready ? 'ready' : 'loading…'}
          </div>

          {/* Live gesture chip */}
          {gestures && running && (
            <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl
                            bg-gray-950/85 backdrop-blur-sm border border-gray-700
                            text-[11px]">
              <div className="text-cyan-300 font-bold mb-0.5">
                {gestures.hand} hand {gestures.pinch && '· 🤏 pinch'}
              </div>
              <div className="font-mono text-gray-400 text-[10px]">
                {Object.entries(gestures.fingers).map(([k, up]) => (
                  <span key={k} className={up ? 'text-emerald-300' : 'text-gray-600'}>
                    {k[0]}{up ? '↑' : '·'}{' '}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!running && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <Button type="primary" size="large" icon={<PlayCircleFilled />}
                disabled={!ready} loading={!ready}
                onClick={start}
                style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6, #ec4899)', border: 'none', fontWeight: 700 }}
                className="!h-12 !px-6">
                {ready ? 'Start camera' : 'Loading MediaPipe…'}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Toolbar — switches contents based on the active mode */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Mode-specific tool panel */}
          {mode === 'draw' && (
            <div className="rounded-xl border border-violet-500/40 bg-gray-950/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                ✍ Drawing — pinch index + thumb to draw
              </div>
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      color === c ? 'border-white scale-110 shadow-md' : 'border-gray-700'
                    }`}
                    style={{ background: c }}
                    title={c} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 font-bold shrink-0">Brush</span>
                <Slider min={2} max={24} value={brush} onChange={setBrush} className="flex-1"
                  tooltip={{ formatter: (v) => `${v}px` }} />
                <span className="text-[10px] font-mono text-gray-400 w-8">{brush}px</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button size="small" icon={<ClearOutlined />} onClick={clearDrawing}>Clear</Button>
                <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={saveDrawing}
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', border: 'none' }}>
                  Save PNG
                </Button>
              </div>
            </div>
          )}

          {/* Cursor mode — pick a cursor style */}
          {mode === 'cursor' && (
            <div className="rounded-xl border border-amber-500/40 bg-gray-950/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                🎯 Cursor — pick a style
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {CURSORS.map(c => {
                  const active = cursorStyle === c.id
                  return (
                    <button key={c.id} onClick={() => setCursorStyle(c.id)}
                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg
                                  border-2 transition-all ${
                        active
                          ? 'border-amber-400 bg-amber-500/15 shadow-md shadow-amber-500/20 scale-[1.03]'
                          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                      }`}>
                      <CursorVisual id={c.id} accent={c.accent} state="idle" />
                      <span className="text-[10px] font-semibold text-gray-300">{c.label.split(' ')[1]}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-snug">
                Index fingertip = cursor · 🤏 pinch = click. The cursor floats over
                the whole page so you can hover and click any button.
              </p>
            </div>
          )}

          {/* Filters mode — explain the 4 gestures + show what's currently active */}
          {mode === 'filters' && (
            <div className="rounded-xl border border-fuchsia-500/40 bg-gray-950/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 flex items-center justify-between">
                <span>✨ Filters — gesture-driven</span>
                {activeFilter && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded
                                   bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40">
                    active: {activeFilter}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'fist',  label: 'Fist',        effect: 'Dither' },
                  { id: 'peace', label: 'Peace ✌',     effect: 'VHS + chromatic' },
                  { id: 'point', label: 'Point ☝',     effect: 'Spotlight' },
                  { id: 'open',  label: 'Open hand ✋', effect: 'Water ripple' },
                ].map(g => {
                  const on = activeFilter === g.id
                  return (
                    <div key={g.id}
                      className={`p-2 rounded-lg border ${
                        on
                          ? 'border-fuchsia-400 bg-fuchsia-500/10 shadow-md shadow-fuchsia-500/20'
                          : 'border-gray-800 bg-gray-900/40'
                      }`}>
                      <div className={`text-xs font-bold ${on ? 'text-white' : 'text-gray-300'}`}>
                        {g.label}
                      </div>
                      <div className="text-[10px] text-gray-500">→ {g.effect}</div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-snug">
                A white dot tracks your index fingertip. Make any of the 4 gestures
                above to swap effects in real-time.
              </p>
            </div>
          )}

          {/* View mode — small instruction card */}
          {mode === 'view' && (
            <div className="rounded-xl border border-cyan-500/40 bg-gray-950/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                👁 Skeleton view
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                21 landmarks per hand (up to 2 hands) rendered as a live skeleton.
                Fingertips colored per finger: thumb amber, index cyan, middle
                violet, ring pink, pinky green.
              </p>
            </div>
          )}

          {/* Controls + Tips */}
          <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
              Controls
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {running ? (
                <Button icon={<PauseCircleFilled />} onClick={stop}>Stop camera</Button>
              ) : (
                <Button type="primary" icon={<PlayCircleFilled />} onClick={start}
                  disabled={!ready}
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', border: 'none' }}>
                  Start camera
                </Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => { stop(); setTimeout(start, 300) }}
                disabled={!ready}>
                Restart
              </Button>
            </div>
            <ul className="text-[11px] text-gray-400 leading-relaxed space-y-1 pl-4 list-disc">
              <li><span className="text-cyan-300 font-semibold">Skeleton mode</span> — just visualize the bones</li>
              <li><span className="text-violet-300 font-semibold">Draw mode</span> — 🤏 pinch index + thumb to draw, release to lift the pen</li>
              <li><span className="text-amber-300 font-semibold">Cursor mode</span> — index fingertip moves a pointer; 🤏 pinch fires a click</li>
              <li>Everything runs in-browser. Nothing leaves your device.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Virtual cursor — only meaningful in cursor mode. Picks its
          visual from the cursor style state so users can choose one
          they like. */}
      {mode === 'cursor' && running && (() => {
        const cur = CURSORS.find(c => c.id === cursorStyle) || CURSORS[0]
        return (
          <div ref={cursorRef}
            data-state="idle"
            className="fixed top-0 left-0 z-[60] pointer-events-none flex items-center justify-center
                       -translate-x-1/2 -translate-y-1/2 w-10 h-10">
            <CursorVisual id={cur.id} accent={cur.accent}
              state={cursorRef.current?.dataset?.state || 'idle'} />
          </div>
        )
      })()}
    </div>
  )
}
