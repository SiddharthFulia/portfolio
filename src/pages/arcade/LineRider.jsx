// LineRider.jsx — draw lines with mouse, sledder rides them.
//
// Physics approach:
//   - Sledder is a 2-particle body (front + back "feet") connected by a
//     rigid distance constraint (like a plank on skis). A third particle
//     for the head hangs above the midpoint by another constraint —
//     acts as an "arm" that swings around, contributing rotation feel.
//   - Verlet integration for feet + head.
//   - Line collisions: for each track line segment, project each particle
//     onto the segment; if within thickness, push out along normal and
//     reflect velocity component along normal (0.4 restitution).
//   - Sliding friction: tangential velocity multiplied by 0.995 per contact.
//   - Camera follows sledder centroid, smooth-tweened.
//   - Save/load track to localStorage under 'linerider-track'.

import { useEffect, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'

const W = 900
const H = 500
const GRAVITY = 0.28
const DAMPING = 0.998
const FOOT_DIST = 24
const HEAD_DIST = 22
const PARTICLE_R = 6
const LINE_THICKNESS = 3
const TRACK_KEY = 'linerider-track'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Segment-point closest with param
const segClosest = (x1, y1, x2, y2, px, py) => {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1) : 0
  const cx = x1 + t * dx, cy = y1 + t * dy
  return { x: cx, y: cy, t, distance: Math.hypot(cx - px, cy - py), nx: (px - cx), ny: (py - cy) }
}

export default function LineRider() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    tool: 'draw', // 'draw' | 'erase'
    tracks: [], // { pts: [{x,y},...], color: '#...' }
    currentStroke: null,
    isDrawing: false,
    mode: 'edit', // 'edit' | 'play'
    sledder: null,
    camera: { x: 0, y: 0, tx: 0, ty: 0 },
    startPt: [120, 100],
    distance: 0,
    maxDistance: 0,
    fx: [],
    reduced: false,
    shake: 0,
  })

  const [status, setStatus] = useState('ready')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [tool, setTool] = useState('draw')
  const [mode, setMode] = useState('edit')
  const [distance, setDistance] = useState(0)
  const [best, setBest] = useState(0)
  const [numLines, setNumLines] = useState(0)

  const audioRef = useRef(null)
  const beep = useCallback((f, d, t = 'sine', v = 0.04) => {
    if (!soundOn) return
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioRef.current
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.type = t; osc.frequency.value = f
      g.gain.setValueAtTime(v, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d)
      osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + d)
    } catch {}
  }, [soundOn])

  // Load persisted track
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRACK_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          stateRef.current.tracks = parsed
          setNumLines(parsed.reduce((acc, tr) => acc + Math.max(0, tr.pts.length - 1), 0))
        }
      }
      const b = +(localStorage.getItem('linerider-best') || 0)
      if (b) setBest(b)
    } catch {}
  }, [])

  const saveTrack = useCallback(() => {
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(stateRef.current.tracks)) } catch {}
  }, [])

  const clearTrack = useCallback(() => {
    stateRef.current.tracks = []
    setNumLines(0)
    saveTrack()
  }, [saveTrack])

  const seedTrack = useCallback(() => {
    // Provide a starter ramp so first-time users see the sledder work
    const s = stateRef.current
    s.tracks = [
      { pts: [{ x: 120, y: 150 }, { x: 300, y: 220 }, { x: 500, y: 320 }, { x: 700, y: 380 }, { x: 900, y: 400 }] },
      { pts: [{ x: 380, y: 350 }, { x: 480, y: 280 }, { x: 560, y: 340 }] },
      { pts: [{ x: 700, y: 380 }, { x: 850, y: 300 }, { x: 950, y: 340 }] },
    ]
    setNumLines(s.tracks.reduce((acc, tr) => acc + Math.max(0, tr.pts.length - 1), 0))
    saveTrack()
  }, [saveTrack])

  const startPlay = useCallback(() => {
    const s = stateRef.current
    // Build sledder at start point
    const [sx, sy] = s.startPt
    s.sledder = {
      // Feet: two particles connected by rigid distance
      backX: sx, backY: sy, backPx: sx - 2, backPy: sy,
      frontX: sx + FOOT_DIST, frontY: sy, frontPx: sx + FOOT_DIST - 2, frontPy: sy,
      // Head: hangs above midpoint
      headX: sx + FOOT_DIST / 2, headY: sy - HEAD_DIST, headPx: sx + FOOT_DIST / 2 - 1, headPy: sy - HEAD_DIST,
      alive: true,
      armSwing: 0,
    }
    s.mode = 'play'
    s.distance = 0
    s.camera = { x: 0, y: 0, tx: 0, ty: 0 }
    setMode('play')
    setDistance(0)
    setStatus('playing')
  }, [])

  const stopPlay = useCallback(() => {
    const s = stateRef.current
    s.sledder = null
    s.mode = 'edit'
    setMode('edit')
    setStatus('ready')
  }, [])

  const reset = useCallback(() => {
    stopPlay()
  }, [stopPlay])

  // Input for drawing / erasing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current
    const getPt = (e) => {
      const rect = canvas.getBoundingClientRect()
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
      return [cx / rect.width * W + s.camera.x, cy / rect.height * H + s.camera.y]
    }
    const down = (e) => {
      if (s.mode !== 'edit') return
      e.preventDefault()
      const [x, y] = getPt(e)
      if (s.tool === 'draw') {
        s.currentStroke = { pts: [{ x, y }] }
        s.isDrawing = true
      } else if (s.tool === 'erase') {
        // Delete lines near this point
        s.tracks = s.tracks.filter(tr => {
          for (const p of tr.pts) if (Math.hypot(p.x - x, p.y - y) < 20) return false
          return true
        })
        setNumLines(s.tracks.reduce((acc, tr) => acc + Math.max(0, tr.pts.length - 1), 0))
        saveTrack()
      }
    }
    const move = (e) => {
      if (!s.isDrawing) return
      e.preventDefault()
      const [x, y] = getPt(e)
      const last = s.currentStroke.pts[s.currentStroke.pts.length - 1]
      if (Math.hypot(x - last.x, y - last.y) > 8) {
        s.currentStroke.pts.push({ x, y })
      }
    }
    const up = () => {
      if (!s.isDrawing) return
      s.isDrawing = false
      if (s.currentStroke && s.currentStroke.pts.length > 1) {
        s.tracks.push(s.currentStroke)
        setNumLines(s.tracks.reduce((acc, tr) => acc + Math.max(0, tr.pts.length - 1), 0))
        saveTrack()
      }
      s.currentStroke = null
    }
    canvas.addEventListener('mousedown', down)
    canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    canvas.addEventListener('touchstart', down, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', up)
    return () => {
      canvas.removeEventListener('mousedown', down)
      canvas.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      canvas.removeEventListener('touchstart', down)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', up)
    }
  }, [saveTrack])

  useEffect(() => {
    let raf, last = performance.now()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    s.reduced = mq.matches

    const addFx = (x, y, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1 + Math.random() * 3
        s.fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 20, color })
      }
    }

    // Constraint solve for sledder
    const solveConstraint = (name, ax, ay, apx, apy, bx, by, bpx, bpy, rest) => {
      // returns [ax,ay,bx,by] enforced
      const dx = bx - ax, dy = by - ay
      const d = Math.hypot(dx, dy) || 0.001
      const diff = (d - rest) / d
      const kx = dx * 0.5 * diff, ky = dy * 0.5 * diff
      return [ax + kx, ay + ky, bx - kx, by - ky]
    }

    // Collide particle with all track segments
    const collideParticle = (px, py, ppx, ppy) => {
      for (const tr of s.tracks) {
        for (let i = 0; i < tr.pts.length - 1; i++) {
          const p1 = tr.pts[i], p2 = tr.pts[i + 1]
          const info = segClosest(p1.x, p1.y, p2.x, p2.y, px, py)
          const R = PARTICLE_R + LINE_THICKNESS
          if (info.distance < R) {
            const nx = info.distance > 0.01 ? info.nx / info.distance : 0
            const ny = info.distance > 0.01 ? info.ny / info.distance : -1
            const pen = R - info.distance
            px += nx * pen
            py += ny * pen
            // Reflect velocity along normal (Verlet: adjust prev)
            const vx = px - ppx, vy = py - ppy
            const vdotn = vx * nx + vy * ny
            if (vdotn < 0) {
              const rest = 0.15
              const tx = vx - vdotn * nx
              const ty = vy - vdotn * ny
              const newvx = tx * 0.995 - vdotn * nx * rest
              const newvy = ty * 0.995 - vdotn * ny * rest
              ppx = px - newvx
              ppy = py - newvy
              if (Math.abs(vdotn) > 4 && !s.reduced) {
                s.shake = Math.min(s.shake + 3, 8)
                addFx(px, py, 3, '#fef3c7')
              }
            }
          }
        }
      }
      return [px, py, ppx, ppy]
    }

    const step = () => {
      if (s.mode !== 'play' || !s.sledder || !s.sledder.alive) return
      const sd = s.sledder
      // Integrate each particle
      const integ = (x, y, px, py, gravity = true) => {
        const vx = (x - px) * DAMPING
        const vy = (y - py) * DAMPING
        const npx = x, npy = y
        let nx = x + vx, ny = y + vy + (gravity ? GRAVITY : 0)
        return [nx, ny, npx, npy]
      }
      let [fbx, fby, fbpx, fbpy] = integ(sd.backX, sd.backY, sd.backPx, sd.backPy)
      let [ffx, ffy, ffpx, ffpy] = integ(sd.frontX, sd.frontY, sd.frontPx, sd.frontPy)
      let [fhx, fhy, fhpx, fhpy] = integ(sd.headX, sd.headY, sd.headPx, sd.headPy)

      // Collide
      ;[fbx, fby, fbpx, fbpy] = collideParticle(fbx, fby, fbpx, fbpy)
      ;[ffx, ffy, ffpx, ffpy] = collideParticle(ffx, ffy, ffpx, ffpy)
      ;[fhx, fhy, fhpx, fhpy] = collideParticle(fhx, fhy, fhpx, fhpy)

      // Constraint iterations
      for (let iter = 0; iter < 5; iter++) {
        // Feet rigid distance
        ;[fbx, fby, ffx, ffy] = solveConstraint('feet', fbx, fby, fbpx, fbpy, ffx, ffy, ffpx, ffpy, FOOT_DIST)
        // Head to midpoint
        const mx = (fbx + ffx) / 2, my = (fby + ffy) / 2
        const dx = fhx - mx, dy = fhy - my
        const d = Math.hypot(dx, dy) || 0.001
        const diff = (d - HEAD_DIST) / d * 0.5
        fhx -= dx * diff
        fhy -= dy * diff
      }

      sd.backX = fbx; sd.backY = fby; sd.backPx = fbpx; sd.backPy = fbpy
      sd.frontX = ffx; sd.frontY = ffy; sd.frontPx = ffpx; sd.frontPy = ffpy
      sd.headX = fhx; sd.headY = fhy; sd.headPx = fhpx; sd.headPy = fhpy
      sd.armSwing += 0.15

      // Distance tracker
      const cx = (fbx + ffx) / 2
      s.distance = Math.max(s.distance, cx - s.startPt[0])
      setDistance(Math.floor(s.distance))

      // Camera follow (smooth)
      s.camera.tx = cx - W / 2
      s.camera.ty = ((fby + ffy) / 2) - H / 2
      s.camera.x += (s.camera.tx - s.camera.x) * 0.08
      s.camera.y += (s.camera.ty - s.camera.y) * 0.08
      // Clamp camera y (don't go too far up above 0)
      if (s.camera.y < -300) s.camera.y = -300

      // Death: falls too far down or head slams too hard
      if (fby > 2000) {
        sd.alive = false
        setStatus('over')
        setBest(prev => {
          const nb = Math.max(prev, Math.floor(s.distance))
          try { localStorage.setItem('linerider-best', String(nb)) } catch {}
          return nb
        })
      }

      // Fx
      s.fx = s.fx.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--
        return p.life > 0
      })
      if (s.shake > 0) s.shake *= 0.86
    }

    const draw = () => {
      const shakeX = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#bfdbfe'); sky.addColorStop(1, '#f0f9ff')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

      ctx.save()
      ctx.translate(-s.camera.x + shakeX, -s.camera.y + shakeY)

      // Parallax clouds
      for (let c = 0; c < 6; c++) {
        const cx = ((c * 300 - s.camera.x * 0.3) % 1200) - 100
        const cy = 60 + c * 20 - s.camera.y * 0.1
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.beginPath()
        ctx.arc(cx, cy, 30, 0, Math.PI * 2)
        ctx.arc(cx + 25, cy - 5, 25, 0, Math.PI * 2)
        ctx.arc(cx + 50, cy, 30, 0, Math.PI * 2)
        ctx.fill()
      }

      // Start marker
      const [sx, sy] = s.startPt
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(sx - 3, sy - 20, 6, 20)
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.moveTo(sx + 3, sy - 20); ctx.lineTo(sx + 20, sy - 15); ctx.lineTo(sx + 3, sy - 10)
      ctx.closePath(); ctx.fill()

      // Tracks
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = LINE_THICKNESS * 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      s.tracks.forEach(tr => {
        if (tr.pts.length < 2) return
        ctx.beginPath()
        ctx.moveTo(tr.pts[0].x, tr.pts[0].y)
        // Smooth with quadratic curves
        for (let i = 1; i < tr.pts.length - 1; i++) {
          const p = tr.pts[i], n = tr.pts[i + 1]
          ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2)
        }
        ctx.lineTo(tr.pts[tr.pts.length - 1].x, tr.pts[tr.pts.length - 1].y)
        ctx.stroke()
      })

      // Current stroke
      if (s.currentStroke && s.currentStroke.pts.length > 1) {
        ctx.strokeStyle = '#f472b6'
        ctx.beginPath()
        ctx.moveTo(s.currentStroke.pts[0].x, s.currentStroke.pts[0].y)
        s.currentStroke.pts.forEach(p => ctx.lineTo(p.x, p.y))
        ctx.stroke()
      }

      // Sledder
      if (s.sledder) {
        const sd = s.sledder
        // Sled plank between feet
        const mx = (sd.backX + sd.frontX) / 2, my = (sd.backY + sd.frontY) / 2
        const angle = Math.atan2(sd.frontY - sd.backY, sd.frontX - sd.backX)
        ctx.save()
        ctx.translate(mx, my)
        ctx.rotate(angle)
        // Sled body (plank)
        ctx.fillStyle = '#78350f'
        ctx.fillRect(-FOOT_DIST / 2 - 2, -4, FOOT_DIST + 4, 5)
        // Skid marks (front curve)
        ctx.strokeStyle = '#78350f'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(FOOT_DIST / 2, -2)
        ctx.quadraticCurveTo(FOOT_DIST / 2 + 4, -6, FOOT_DIST / 2 + 6, -8)
        ctx.stroke()
        ctx.restore()

        // Torso (line from midpoint to head)
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(mx, my - 4)
        ctx.lineTo(sd.headX, sd.headY + 4)
        ctx.stroke()

        // Arms — swing based on velocity
        const headAngle = Math.atan2(sd.headY - my, sd.headX - mx)
        const armLen = 12
        const swing = Math.sin(sd.armSwing) * 0.6
        const armA = headAngle + Math.PI / 2 + swing
        const armB = headAngle + Math.PI / 2 - swing
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(sd.headX, sd.headY + 4)
        ctx.lineTo(sd.headX + Math.cos(armA) * armLen, sd.headY + 4 + Math.sin(armA) * armLen)
        ctx.moveTo(sd.headX, sd.headY + 4)
        ctx.lineTo(sd.headX + Math.cos(armB) * armLen, sd.headY + 4 + Math.sin(armB) * armLen)
        ctx.stroke()

        // Legs (from midpoint down to feet)
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(mx - 3, my - 2)
        ctx.lineTo(sd.backX, sd.backY - 1)
        ctx.moveTo(mx + 3, my - 2)
        ctx.lineTo(sd.frontX, sd.frontY - 1)
        ctx.stroke()

        // Head
        ctx.fillStyle = '#fde68a'
        ctx.beginPath()
        ctx.arc(sd.headX, sd.headY, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.5; ctx.stroke()
        // Beanie
        ctx.fillStyle = '#dc2626'
        ctx.beginPath()
        ctx.arc(sd.headX, sd.headY - 3, 9, Math.PI, Math.PI * 2)
        ctx.fill()
        // Pompom
        ctx.fillStyle = '#fef3c7'
        ctx.beginPath()
        ctx.arc(sd.headX, sd.headY - 10, 3, 0, Math.PI * 2); ctx.fill()
        // Eye
        ctx.fillStyle = '#000'
        ctx.beginPath(); ctx.arc(sd.headX + 3, sd.headY, 1.5, 0, Math.PI * 2); ctx.fill()
      }

      // Fx
      s.fx.forEach(p => {
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 20))
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
      })
      ctx.globalAlpha = 1

      ctx.restore()

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 26)
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px monospace'
      const modeText = s.mode === 'edit' ? 'EDIT · ' + (s.tool === 'draw' ? 'DRAW' : 'ERASE') : 'RIDING'
      ctx.fillText(`${modeText}  ·  LINES ${s.tracks.reduce((a,t)=>a+t.pts.length-1,0)}  ·  DISTANCE ${Math.floor(s.distance)}px  ·  BEST ${best}`, 10, 18)
    }

    const loop = () => {
      if (!paused && status === 'playing') step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, status, best])

  const toggleTool = () => {
    const s = stateRef.current
    const next = s.tool === 'draw' ? 'erase' : 'draw'
    s.tool = next
    setTool(next)
  }

  return (
    <GameShell
      title="Line Rider"
      category="Physics"
      score={distance}
      best={best}
      level={numLines}
      status={paused ? 'paused' : status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setPaused(p => !p)}
      onRestart={reset}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Mode</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{mode === 'edit' ? 'EDIT' : 'RIDE'}</span>
        </div>
      }
      controls={[
        { key: 'Draw', label: 'Drag to sketch a line' },
        { key: 'Erase', label: 'Click near a line to remove it' },
        { key: 'Play', label: 'Send the sledder' },
      ]}
      footer={
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={toggleTool} disabled={mode !== 'edit'}
            className={`px-3 py-1.5 rounded-lg border ${tool === 'draw' ? 'bg-amber-500 text-black border-amber-300' : 'bg-white/5 border-white/20 text-white'} disabled:opacity-40`}>
            {tool === 'draw' ? 'Drawing' : 'Erasing'}
          </button>
          {mode === 'edit' ? (
            <button type="button" onClick={startPlay}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-bold border border-emerald-300">Play</button>
          ) : (
            <button type="button" onClick={stopPlay}
              className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold border border-rose-300">Stop</button>
          )}
          <button type="button" onClick={clearTrack} disabled={mode !== 'edit'}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white disabled:opacity-40">Clear</button>
          <button type="button" onClick={seedTrack} disabled={mode !== 'edit'}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white disabled:opacity-40">Seed demo track</button>
          <button type="button" onClick={saveTrack} disabled={mode !== 'edit'}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white disabled:opacity-40">Save</button>
        </div>
      }
      overlay={status === 'over' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold text-rose-300">Sledder fell!</div>
          <div className="text-white/70 text-sm">Distance {distance}px · Best {best}px</div>
          <button type="button" onClick={reset} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Back to editor</button>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        className="w-full max-h-[80vh] object-contain block mx-auto"
        style={{ imageRendering: 'crisp-edges', aspectRatio: `${W}/${H}`, touchAction: 'none', cursor: mode === 'edit' ? (tool === 'draw' ? 'crosshair' : 'not-allowed') : 'default' }}
      />
    </GameShell>
  )
}
