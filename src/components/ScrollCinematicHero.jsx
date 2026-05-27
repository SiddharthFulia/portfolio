// ScrollCinematicHero — Apple-product-reveal hero. A 120-frame WebP
// sequence (10s @ 12fps, scaled to 1280px, extracted from
// public/hero-frames/) gets driven by scroll position. The current
// frame is drawn onto a single <canvas>, foreground content stays
// composited above, and overlays (vignette + grain + crimson glow)
// give the cinematic depth.
//
// Build flow:
//   npm run extract:hero-frames                      ← extracts frames
//   import ScrollCinematicHero from '@/components/ScrollCinematicHero'
//   <ScrollCinematicHero />                          ← drop in
//
// Performance contract:
//   - First 10 frames preload synchronously so the canvas is never
//     blank above the fold.
//   - Frames 11..120 lazy-load in chunked rAF batches; the canvas
//     re-paints whenever a needed frame finally arrives.
//   - Scroll → frame index → drawImage. Frame is computed inside a
//     rAF tick so the scroll listener never blocks.
//   - Mobile / prefers-reduced-motion: skip the scroll trick + the
//     frame loader entirely. Render the first frame as a static
//     poster + the foreground content. Same component, lighter path.
//   - Pinned at 100vh while the user scrolls a 300vh container, so
//     the section "stays" on screen for ~3 viewport heights of
//     scroll and then releases back to the regular page flow.
//
// Style: dark obsidian backdrop, crimson glow, glassmorphism status
// pill, subtle grain. Designed to lead a portfolio so the next
// section (about / projects) lives directly below.

import { useEffect, useRef, useState } from 'react'
import { ArrowRightOutlined, RightOutlined } from '@ant-design/icons'

// Configuration — keep in sync with the npm extract:hero-frames script.
const FRAME_COUNT       = 120
const FRAME_PATH        = (i) => `/hero-frames/frame_${String(i).padStart(4, '0')}.webp`
const FIRST_FRAME       = FRAME_PATH(1)
const SCROLL_VH_TRAVEL  = 300       // section height in vh — frame travel range
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SMALL_SCREEN_PX   = 768       // below this we use the mobile-tuned path

// Three render tiers:
//   'full'      — desktop, every frame, 10 eager preload
//   'mobile'    — phone, every 2nd frame (60 effective), 6 eager preload,
//                 shorter scroll runway so the experience doesn't drag
//   'fallback'  — prefers-reduced-motion → static poster, no scroll
const TIER_CONFIG = {
  full:     { stride: 1, eager: 10, runwayVh: 300 },
  mobile:   { stride: 2, eager: 6,  runwayVh: 200 },
  fallback: { stride: 1, eager: 1,  runwayVh: 100 },
}

export default function ScrollCinematicHero({
  // The title block can be overridden if you want to reuse this on
  // a sub-page; defaults match the user's brief.
  title    = 'Siddharth Fulia',
  subtitle = 'AI Engineer building cinematic intelligence systems, GPU-powered creative tools, and next-generation web experiences.',
  ctaPrimary   = { label: 'Explore AI Lab',  href: '/lab' },
  ctaSecondary = { label: 'View Projects',   href: '/projects' },
}) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const framesRef    = useRef([])     // [HTMLImageElement | null] indexed 0..FRAME_COUNT-1
  const lastDrawnRef = useRef(-1)
  const rafIdRef     = useRef(0)

  // Decide which render tier to use ONCE on mount — switching mid-mount
  // would tear down the canvas listener.
  const [renderMode, setRenderMode] = useState('full')  // 'full' | 'mobile' | 'fallback'
  const cfg = TIER_CONFIG[renderMode]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia?.(REDUCED_MOTION_QUERY).matches
    const small   = window.innerWidth < SMALL_SCREEN_PX
    setRenderMode(reduced ? 'fallback' : small ? 'mobile' : 'full')
  }, [])

  // Build the active frame index list for the current tier. On
  // mobile we use every Nth frame to halve the network + memory cost
  // (60 frames instead of 120 at stride=2). The scroll-to-frame
  // mapping uses indices INTO this list, so the user still gets
  // smooth scrubbing across the section.
  const activeIndices = (() => {
    const out = []
    for (let i = 0; i < FRAME_COUNT; i += cfg.stride) out.push(i)
    return out
  })()
  const activeCount = activeIndices.length

  // ── Frame preloader ─────────────────────────────────────────────
  // First `cfg.eager` synchronously so the page never paints a
  // blank canvas. Remaining frames load lazily on idle so we don't
  // saturate the network on first paint.
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
      drawFromScroll()
      await Promise.all(Array.from({ length: cfg.eager - 1 }, (_, k) => loadOne(k + 1)))
      if (cancelled) return
      // Lazy batch — smaller chunks on mobile so the main thread
      // doesn't stutter while the user scrolls.
      const lazyStart = cfg.eager
      const batchSize = renderMode === 'mobile' ? 6 : 10
      const scheduleNext = (cursor) => {
        if (cancelled || cursor >= activeCount) return
        const cb = () => {
          const end = Math.min(cursor + batchSize, activeCount)
          Promise.all(Array.from({ length: end - cursor }, (_, k) => loadOne(cursor + k)))
            .then(() => {
              if (cancelled) return
              drawFromScroll()
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
  // Match the canvas backing-store to its CSS box × devicePixelRatio
  // so the image stays sharp on retina screens. Re-runs on resize.
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
      drawFromScroll()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode])

  // ── Scroll → frame mapping ──────────────────────────────────────
  // The container is `SCROLL_VH_TRAVEL`vh tall. Scroll progress
  // through that container [0..1] maps directly to frame index
  // [0..FRAME_COUNT-1]. We use a rAF to coalesce scroll events.
  const drawFromScroll = () => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return
    const rect = container.getBoundingClientRect()
    // Range over which the section is "pinned" by the user's scroll.
    // top: rect.top, bottom: rect.top + rect.height
    // We translate to a 0..1 progress where 0 = top of container at
    // viewport top, 1 = bottom of container at viewport bottom.
    const viewportH = window.innerHeight
    const total = rect.height - viewportH
    const traveled = -rect.top
    const progress = total > 0 ? Math.max(0, Math.min(1, traveled / total)) : 0
    const slotCount = framesRef.current.length || 1
    const targetIdx = Math.round(progress * (slotCount - 1))
    // Pick the best available frame — fall back to the nearest
    // already-loaded one so the canvas never blanks while a frame
    // is still in flight from the lazy loader.
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
    // Cover-fit (like CSS background-size: cover) — preserves the
    // cinematic crop on every aspect ratio.
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

  useEffect(() => {
    if (renderMode === 'fallback') return undefined
    const onScroll = () => {
      if (rafIdRef.current) return
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0
        drawFromScroll()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    drawFromScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafIdRef.current) window.cancelAnimationFrame(rafIdRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode])

  // ── Render ──────────────────────────────────────────────────────
  // The container is the scroll runway (300vh). The inner sticky
  // box is what the user sees: 100vh, pinned while scrolling
  // through the runway. Canvas fills the inner box; foreground
  // content + overlays composite above.
  return (
    <section
      ref={containerRef}
      className="relative w-full bg-[#07070b]"
      style={{ height: `${cfg.runwayVh}vh` }}
      aria-label="Cinematic intro"
    >
      {/* Static <img> behind the canvas so the page is never blank
          even before the first frame's onload fires. It gets covered
          by the canvas the moment the first drawImage lands. */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
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

        {/* Overlays — vignette + crimson glow + grain. All
            non-interactive so they don't steal pointer events from
            the CTA buttons. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background:
            'radial-gradient(120% 80% at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.85) 100%)'
          }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background:
            'radial-gradient(50% 35% at 50% 50%, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0) 70%)',
            mixBlendMode: 'screen',
          }} />
        {/* Subtle film grain — pure CSS, no asset needed */}
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
          style={{ backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            backgroundSize: '200px 200px',
          }} />

        {/* Foreground content — centered, max-w-3xl, glassmorphism
            on the status pill. Crimson highlight on the last word
            of the title for the Apple-x-NVIDIA accent. */}
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

            {/* Scroll hint — fades out after the first frame swap.
                Pure visual cue, not a button (so screen readers
                aren't told to interact with it). */}
            <div className="mt-12 inline-flex flex-col items-center gap-2 opacity-60">
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">
                Scroll to explore
              </span>
              <span className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
