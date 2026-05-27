// ScrollCinematicHero — Apple-product-reveal hero. A 120-frame WebP
// sequence (10s @ 12fps, scaled to 1280px, extracted from
// public/hero-frames/) gets driven by the user's scroll WHEEL — the
// page itself does NOT scroll while the video plays. Once the video
// reaches the end, body scroll unlocks and the visitor can scroll
// into the next section.
//
// Build flow:
//   npm run extract:hero-frames                      ← extracts frames
//   <ScrollCinematicHero />                          ← drop in
//
// Interaction contract:
//   - On mount: body overflow is locked → page can't scroll.
//   - Wheel / touch delta advances a virtual progress counter [0..1].
//     The matching frame is drawn onto a single <canvas>.
//   - Progress can move backwards too (scroll up rewinds the video).
//   - When progress === 1 the body scroll lock releases and a
//     "Continue ↓" hint fades in, inviting the user to scroll into
//     the next section.
//   - prefers-reduced-motion / very small screens: skip the lock,
//     show a static poster, let the page scroll normally.
//
// Style: dark obsidian backdrop, crimson glow, glassmorphism status
// pill, subtle grain. Built to lead a portfolio so the next section
// (full-stack engineer card) lives directly below.

import { useEffect, useRef, useState } from 'react'
import { ArrowRightOutlined, RightOutlined, DownOutlined } from '@ant-design/icons'

const FRAME_COUNT       = 120
const FRAME_PATH        = (i) => `/hero-frames/frame_${String(i).padStart(4, '0')}.webp`
const FIRST_FRAME       = FRAME_PATH(1)
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SMALL_SCREEN_PX   = 768

// One wheel notch ≈ 100 px deltaY. WHEEL_PER_PX = how much of the
// 0..1 video progress one pixel of wheel travel buys. Tuned so a
// brisk trackpad swipe (~600 px) covers the full video.
const WHEEL_PER_PX  = 1 / 1400
const TOUCH_PER_PX  = 1 / 700

const TIER_CONFIG = {
  full:     { stride: 1, eager: 12 },
  mobile:   { stride: 2, eager: 8 },
  fallback: { stride: 1, eager: 1 },
}

export default function ScrollCinematicHero({
  title    = 'Siddharth Fulia',
  subtitle = 'AI Engineer building cinematic intelligence systems, GPU-powered creative tools, and next-generation web experiences.',
  ctaPrimary   = { label: 'Explore AI Lab',  href: '/lab' },
  ctaSecondary = { label: 'View Projects',   href: '/projects' },
}) {
  const canvasRef    = useRef(null)
  const framesRef    = useRef([])
  const lastDrawnRef = useRef(-1)
  const progressRef  = useRef(0)     // 0..1 — driven by wheel/touch
  const rafIdRef     = useRef(0)

  const [renderMode, setRenderMode]     = useState('full')      // 'full' | 'mobile' | 'fallback'
  const [videoComplete, setVideoComplete] = useState(false)
  const [progressPct, setProgressPct]   = useState(0)           // 0..100 for the bar
  const cfg = TIER_CONFIG[renderMode]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia?.(REDUCED_MOTION_QUERY).matches
    const small   = window.innerWidth < SMALL_SCREEN_PX
    setRenderMode(reduced ? 'fallback' : small ? 'mobile' : 'full')
  }, [])

  // Frames available in the active tier (every Nth on mobile).
  const activeIndices = (() => {
    const out = []
    for (let i = 0; i < FRAME_COUNT; i += cfg.stride) out.push(i)
    return out
  })()
  const activeCount = activeIndices.length

  // ── Frame preloader ─────────────────────────────────────────────
  useEffect(() => {
    if (renderMode === 'fallback') return undefined
    framesRef.current = new Array(activeCount).fill(null)
    let cancelled = false

    const loadOne = (slot) => new Promise((resolve) => {
      const sourceIdx = activeIndices[slot]
      const img = new Image()
      img.decoding = 'async'
      img.onload  = () => { framesRef.current[slot] = img; resolve(true) }
      img.onerror = () => resolve(false)
      img.src = FRAME_PATH(sourceIdx + 1)
    })

    ;(async () => {
      await loadOne(0)
      if (cancelled) return
      drawFromProgress()
      await Promise.all(Array.from({ length: cfg.eager - 1 }, (_, k) => loadOne(k + 1)))
      if (cancelled) return
      const lazyStart = cfg.eager
      const batchSize = renderMode === 'mobile' ? 6 : 10
      const scheduleNext = (cursor) => {
        if (cancelled || cursor >= activeCount) return
        const cb = () => {
          const end = Math.min(cursor + batchSize, activeCount)
          Promise.all(Array.from({ length: end - cursor }, (_, k) => loadOne(cursor + k)))
            .then(() => {
              if (cancelled) return
              drawFromProgress()
              scheduleNext(end)
            })
        }
        if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout: 500 })
        else setTimeout(cb, 16)
      }
      scheduleNext(lazyStart)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode])

  // ── Canvas sizing ───────────────────────────────────────────────
  useEffect(() => {
    if (renderMode === 'fallback') return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width  = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      lastDrawnRef.current = -1
      drawFromProgress()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode])

  // ── Render a frame from the current progress ref ────────────────
  const drawFromProgress = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const slotCount = framesRef.current.length || 1
    const targetIdx = Math.round(progressRef.current * (slotCount - 1))
    let pickIdx = targetIdx
    const frames = framesRef.current
    if (!frames[pickIdx]) {
      for (let k = 1; k <= slotCount; k++) {
        if (pickIdx - k >= 0 && frames[pickIdx - k]) { pickIdx = pickIdx - k; break }
        if (pickIdx + k <  slotCount && frames[pickIdx + k]) { pickIdx = pickIdx + k; break }
      }
    }
    if (pickIdx === lastDrawnRef.current) return
    const img = frames[pickIdx]
    if (!img) return
    lastDrawnRef.current = pickIdx
    const ctx = canvas.getContext('2d')
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    const scale = Math.max(cw / iw, ch / ih)
    const dw = iw * scale
    const dh = ih * scale
    const dx = (cw - dw) / 2
    const dy = (ch - dh) / 2
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, dx, dy, dw, dh)
  }

  const scheduleDraw = () => {
    if (rafIdRef.current) return
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = 0
      drawFromProgress()
      setProgressPct(Math.round(progressRef.current * 100))
    })
  }

  // ── Lock body scroll while the video is still playing ───────────
  useEffect(() => {
    if (renderMode === 'fallback') return undefined
    if (videoComplete) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [videoComplete, renderMode])

  // ── Wheel / touch → progress ────────────────────────────────────
  useEffect(() => {
    if (renderMode === 'fallback') return undefined
    if (videoComplete) return undefined

    const advance = (delta) => {
      const next = Math.max(0, Math.min(1, progressRef.current + delta))
      progressRef.current = next
      scheduleDraw()
      if (next >= 1 && !videoComplete) {
        setVideoComplete(true)
      }
    }

    const onWheel = (e) => {
      e.preventDefault()
      advance(e.deltaY * WHEEL_PER_PX)
    }

    let touchStartY = 0
    const onTouchStart = (e) => { touchStartY = e.touches[0].clientY }
    const onTouchMove = (e) => {
      const y = e.touches[0].clientY
      const dy = touchStartY - y
      touchStartY = y
      if (Math.abs(dy) > 0) {
        e.preventDefault()
        advance(dy * TOUCH_PER_PX)
      }
    }

    window.addEventListener('wheel',      onWheel,      { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true  })
    window.addEventListener('touchmove',  onTouchMove,  { passive: false })
    return () => {
      window.removeEventListener('wheel',      onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoComplete, renderMode])

  return (
    <section
      className="relative w-full h-screen bg-[#07070b] overflow-hidden"
      aria-label="Cinematic intro"
    >
      <img
        src={FIRST_FRAME}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        decoding="async"
        fetchpriority="high"
      />
      {renderMode !== 'fallback' && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        />
      )}

      {/* Overlays — vignette + crimson glow + grain */}
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background:
          'radial-gradient(120% 80% at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.85) 100%)'
        }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background:
          'radial-gradient(50% 35% at 50% 50%, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0) 70%)',
          mixBlendMode: 'screen',
        }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
        style={{ backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: '200px 200px',
        }} />

      {/* Foreground */}
      <div className="relative z-10 h-full w-full grid place-items-center px-6">
        <div className="max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full
                          border border-white/15 bg-white/[0.04] backdrop-blur-xl
                          text-[10px] font-mono uppercase tracking-[0.3em] text-white/80">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            AI Engineer · Cinematic Systems
          </div>

          <h1 className="font-poppins font-black text-white leading-[1.05]
                         text-[clamp(2.5rem,7vw,5.5rem)] mb-5
                         [text-shadow:0_2px_30px_rgba(0,0,0,0.45)]">
            {title.split(' ').map((word, idx, arr) => (
              <span key={idx} className={idx === arr.length - 1 ? 'text-rose-500' : ''}>
                {word}{idx < arr.length - 1 ? ' ' : ''}
              </span>
            ))}
          </h1>

          <p className="text-white/80 leading-relaxed mb-9
                        text-[clamp(0.95rem,1.4vw,1.15rem)] max-w-2xl mx-auto
                        [text-shadow:0_2px_18px_rgba(0,0,0,0.5)]">
            {subtitle}
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href={ctaPrimary.href}
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-xl
                         bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm
                         shadow-[0_8px_32px_rgba(244,63,94,0.45)] hover:shadow-[0_12px_44px_rgba(244,63,94,0.6)]
                         transition-all min-h-[44px]">
              {ctaPrimary.label}
              <ArrowRightOutlined className="text-[12px] transition-transform group-hover:translate-x-0.5" />
            </a>
            <a href={ctaSecondary.href}
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-xl
                         border border-white/20 bg-white/[0.04] backdrop-blur-xl
                         text-white/90 hover:text-white hover:border-white/40
                         font-semibold text-sm transition-all min-h-[44px]">
              {ctaSecondary.label}
              <RightOutlined className="text-[10px] opacity-70 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Bottom strip — scrubber while playing, "Continue ↓" once done */}
      {renderMode !== 'fallback' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
          {!videoComplete ? (
            <div className="flex flex-col items-center gap-3 pb-6">
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">
                Scroll to play · {progressPct}%
              </span>
              <div className="h-[2px] w-40 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-[width] duration-100"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : (
            <a
              href="#below"
              className="pointer-events-auto mx-auto mb-6 flex w-fit flex-col items-center gap-2
                         text-white/80 hover:text-white transition-colors animate-pulse"
            >
              <span className="text-[10px] font-mono uppercase tracking-[0.3em]">
                Continue
              </span>
              <DownOutlined className="text-[12px]" />
            </a>
          )}
        </div>
      )}
    </section>
  )
}
