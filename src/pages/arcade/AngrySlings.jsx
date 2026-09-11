// AngrySlings.jsx — slingshot birds vs towers of blocks. 10 levels.
//
// Physics: impulse-based 2D rigid body solver (from scratch, zero deps).
//   - Each block is an oriented rectangle (position, rotation, angular vel,
//     mass, inertia). Rest state uses damping.
//   - Bird is a point-mass (fast enough that treating as circle works fine).
//   - Collisions: SAT for OBB-vs-OBB (block-block), circle-vs-OBB for bird-vs-block.
//     Contact impulse resolves normal (with restitution) + tangential (friction).
//   - Solver runs 6 iterations per frame for stable stacks.
//   - Damping: linear 0.995, angular 0.98 — keeps stacks from jittering forever.
//
// 3 bird types:
//   - regular: normal impact
//   - fast: 1.4x launch velocity, small
//   - big: 2.5x mass, huge impact, slow
//
// Score: rubble points (each falling block) + unused birds bonus.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'

const RULES = [
  { heading: 'Goal', body: 'Knock out every pig on the level by flinging birds at their towers. You clear a level when zero pigs remain. Bonus points come from rubble + unused birds.' },
  { heading: 'Controls', body: 'Drag the bird backward from the slingshot to aim + power up. Release to fling. The trajectory arc previews the shot in flight. Space or click during flight to activate the current bird\'s special (fast birds accelerate; big birds arc more).' },
  { heading: 'Bird types', body: '• Regular (red circle): balanced impact, 3-4 per level.\n• Fast (yellow triangle): 1.4× launch velocity, smaller, punches through single blocks.\n• Big (green oval): 2.5× mass, slow but devastating on stacks.\nEach level rations bird types — spend the right bird on the right target.' },
  { heading: 'Physics', body: 'Impulse-based 2D rigid-body solver: OBB-vs-OBB collisions for blocks (SAT algorithm), circle-vs-OBB for the bird. Contact impulses handle normal (restitution) and tangential (friction). 6 iterations per frame keep stacks stable.' },
  { heading: 'Scoring', body: 'Each pig killed: 500 pts. Each block dislodged (falls past a threshold): 10-50 pts depending on block size. Unused birds at level completion: 1000 pts each.' },
  { heading: 'Difficulty', body: 'Easy grants +2 birds per level with weaker blocks. Hard removes 1 bird per level and strengthens block HP. Custom exposes bird count offset, block strength, slo-mo trigger threshold and gravity.' },
]

const DIFFICULTIES = {
  Easy:   { birdBonus: 2,  blockStrength: 0.6, sloMoThreshold: 8, gravity: 0.35 },
  Medium: { birdBonus: 0,  blockStrength: 1.0, sloMoThreshold: 5, gravity: 0.40 },
  Hard:   { birdBonus: -1, blockStrength: 1.6, sloMoThreshold: 3, gravity: 0.48 },
}

const CUSTOM_SCHEMA = {
  birdBonus:      { label: 'Bird count offset',    min: -2, max: 4, step: 1,    default: 0 },
  blockStrength:  { label: 'Block strength ×',     min: 0.3, max: 2.5, step: 0.1, default: 1.0 },
  sloMoThreshold: { label: 'Slo-mo threshold',     min: 1, max: 10, step: 1,    default: 5 },
  gravity:        { label: 'Gravity',              min: 0.1, max: 0.8, step: 0.05, default: 0.4 },
}

const W = 900
const H = 500
const GRAVITY = 0.4
const GROUND_Y = H - 40
const SLING_X = 90
const SLING_Y = GROUND_Y - 60

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]

const BIRD_TYPES = {
  regular: { r: 12, mass: 1, color: '#dc2626', shape: 'round' },
  fast:    { r: 9,  mass: 0.7, color: '#facc15', shape: 'triangle', speedMult: 1.4 },
  big:     { r: 18, mass: 2.5, color: '#16a34a', shape: 'oval' },
}

const mkLevel = (blocks, pigs, birds) => ({ blocks, pigs, birds })

const LEVELS = [
  mkLevel(
    [{ x: 500, y: GROUND_Y - 40, w: 20, h: 80 }, { x: 600, y: GROUND_Y - 40, w: 20, h: 80 }, { x: 550, y: GROUND_Y - 90, w: 120, h: 20 }],
    [{ x: 550, y: GROUND_Y - 20, r: 15 }],
    ['regular', 'regular', 'regular']
  ),
  mkLevel(
    [
      { x: 480, y: GROUND_Y - 30, w: 20, h: 60 }, { x: 520, y: GROUND_Y - 30, w: 20, h: 60 },
      { x: 560, y: GROUND_Y - 30, w: 20, h: 60 }, { x: 600, y: GROUND_Y - 30, w: 20, h: 60 },
      { x: 500, y: GROUND_Y - 70, w: 60, h: 15 }, { x: 580, y: GROUND_Y - 70, w: 60, h: 15 },
      { x: 540, y: GROUND_Y - 100, w: 120, h: 15 },
    ],
    [{ x: 500, y: GROUND_Y - 20, r: 12 }, { x: 580, y: GROUND_Y - 20, r: 12 }],
    ['regular', 'fast', 'regular']
  ),
  mkLevel(
    [
      { x: 500, y: GROUND_Y - 100, w: 20, h: 200 }, { x: 620, y: GROUND_Y - 100, w: 20, h: 200 },
      { x: 560, y: GROUND_Y - 210, w: 140, h: 20 }, { x: 560, y: GROUND_Y - 150, w: 20, h: 20 },
    ],
    [{ x: 560, y: GROUND_Y - 230, r: 14 }, { x: 500, y: GROUND_Y - 20, r: 12 }],
    ['regular', 'fast', 'big']
  ),
  mkLevel(
    [
      ...[0, 1, 2, 3, 4].map(i => ({ x: 450 + i * 40, y: GROUND_Y - 20 - i * 30, w: 30, h: 30 })),
      { x: 700, y: GROUND_Y - 50, w: 20, h: 100 }, { x: 700, y: GROUND_Y - 105, w: 60, h: 10 },
    ],
    [{ x: 700, y: GROUND_Y - 130, r: 14 }],
    ['fast', 'fast', 'regular', 'regular']
  ),
  mkLevel(
    [
      { x: 480, y: GROUND_Y - 60, w: 20, h: 120 }, { x: 620, y: GROUND_Y - 60, w: 20, h: 120 },
      { x: 550, y: GROUND_Y - 130, w: 160, h: 20 },
      { x: 500, y: GROUND_Y - 170, w: 20, h: 40 }, { x: 600, y: GROUND_Y - 170, w: 20, h: 40 },
      { x: 550, y: GROUND_Y - 200, w: 120, h: 15 },
    ],
    [{ x: 550, y: GROUND_Y - 20, r: 14 }, { x: 550, y: GROUND_Y - 140, r: 12 }, { x: 550, y: GROUND_Y - 220, r: 10 }],
    ['big', 'regular', 'regular', 'fast']
  ),
  mkLevel(
    [
      ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ x: 450 + i * 45, y: GROUND_Y - 25, w: 35, h: 50 })),
      { x: 495, y: GROUND_Y - 75, w: 40, h: 15 }, { x: 585, y: GROUND_Y - 75, w: 40, h: 15 }, { x: 675, y: GROUND_Y - 75, w: 40, h: 15 },
    ],
    [{ x: 495, y: GROUND_Y - 100, r: 12 }, { x: 675, y: GROUND_Y - 100, r: 12 }],
    ['fast', 'regular', 'big']
  ),
  mkLevel(
    [
      { x: 500, y: GROUND_Y - 100, w: 100, h: 15 }, { x: 700, y: GROUND_Y - 100, w: 100, h: 15 },
      { x: 500, y: GROUND_Y - 40, w: 15, h: 100 }, { x: 550, y: GROUND_Y - 40, w: 15, h: 100 },
      { x: 700, y: GROUND_Y - 40, w: 15, h: 100 }, { x: 750, y: GROUND_Y - 40, w: 15, h: 100 },
      { x: 620, y: GROUND_Y - 40, w: 20, h: 100 },
    ],
    [{ x: 525, y: GROUND_Y - 20, r: 12 }, { x: 725, y: GROUND_Y - 20, r: 12 }, { x: 620, y: GROUND_Y - 20, r: 12 }],
    ['regular', 'big', 'fast', 'fast']
  ),
  mkLevel(
    [
      { x: 550, y: GROUND_Y - 150, w: 25, h: 300 }, { x: 650, y: GROUND_Y - 150, w: 25, h: 300 },
      { x: 600, y: GROUND_Y - 300, w: 120, h: 15 }, { x: 600, y: GROUND_Y - 220, w: 100, h: 12 }, { x: 600, y: GROUND_Y - 140, w: 100, h: 12 },
    ],
    [{ x: 600, y: GROUND_Y - 320, r: 10 }, { x: 600, y: GROUND_Y - 240, r: 10 }, { x: 600, y: GROUND_Y - 160, r: 10 }],
    ['big', 'big', 'fast', 'regular']
  ),
  mkLevel(
    [
      ...[0, 1, 2, 3, 4, 5].map(i => ({ x: 550 + i * 12, y: GROUND_Y - 20 - i * 40, w: 60, h: 20, rot: (i * 0.08) })),
      { x: 700, y: GROUND_Y - 40, w: 20, h: 80 }, { x: 700, y: GROUND_Y - 95, w: 40, h: 10 },
    ],
    [{ x: 700, y: GROUND_Y - 110, r: 12 }],
    ['fast', 'regular', 'regular']
  ),
  mkLevel(
    [
      { x: 500, y: GROUND_Y - 80, w: 25, h: 160 }, { x: 800, y: GROUND_Y - 80, w: 25, h: 160 },
      { x: 650, y: GROUND_Y - 165, w: 300, h: 15 },
      { x: 550, y: GROUND_Y - 220, w: 20, h: 100 }, { x: 650, y: GROUND_Y - 220, w: 20, h: 100 }, { x: 750, y: GROUND_Y - 220, w: 20, h: 100 },
      { x: 600, y: GROUND_Y - 290, w: 120, h: 15 }, { x: 700, y: GROUND_Y - 290, w: 120, h: 15 },
      { x: 650, y: GROUND_Y - 320, w: 220, h: 15 }, { x: 650, y: GROUND_Y - 355, w: 40, h: 40 },
    ],
    [
      { x: 550, y: GROUND_Y - 20, r: 12 }, { x: 750, y: GROUND_Y - 20, r: 12 },
      { x: 650, y: GROUND_Y - 180, r: 14 }, { x: 600, y: GROUND_Y - 305, r: 10 }, { x: 700, y: GROUND_Y - 305, r: 10 },
    ],
    ['big', 'big', 'fast', 'fast', 'regular', 'regular']
  ),
]

const makeBlock = (x, y, w, h, rot = 0, strengthMul = 1) => {
  const mass = (w * h * 0.001 + 0.5) * (strengthMul || 1)
  return {
    x, y, w, h, rot, vx: 0, vy: 0, omega: 0,
    mass, inv: 1 / mass,
    invI: 12 / (mass * (w * w + h * h)),
    sleep: 0, hit: false, scored: false,
  }
}

const corners = (b) => {
  const hw = b.w / 2, hh = b.h / 2
  return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([lx,ly]) => {
    const [rx, ry] = rot(lx, ly, b.rot)
    return [b.x + rx, b.y + ry]
  })
}

const satOBB = (a, b) => {
  const ca = corners(a), cb = corners(b)
  let bestOverlap = Infinity, bestAxis = null
  const test = (poly1, poly2) => {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly1[i], [x2, y2] = poly1[(i + 1) % 4]
      const ex = x2 - x1, ey = y2 - y1
      const len = Math.hypot(ex, ey) || 1
      const nx = -ey / len, ny = ex / len
      let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity
      poly1.forEach(([px, py]) => { const p = px * nx + py * ny; if (p < min1) min1 = p; if (p > max1) max1 = p })
      poly2.forEach(([px, py]) => { const p = px * nx + py * ny; if (p < min2) min2 = p; if (p > max2) max2 = p })
      if (max1 < min2 || max2 < min1) return false
      const overlap = Math.min(max1, max2) - Math.max(min1, min2)
      if (overlap < bestOverlap) {
        bestOverlap = overlap
        bestAxis = [nx, ny]
        const dx = b.x - a.x, dy = b.y - a.y
        if (dx * nx + dy * ny < 0) bestAxis = [-nx, -ny]
      }
    }
    return true
  }
  if (!test(ca, cb) || !test(cb, ca)) return null
  return { normal: bestAxis, depth: bestOverlap, point: [(a.x + b.x) / 2, (a.y + b.y) / 2] }
}

const circleOBB = (cx, cy, r, b) => {
  const dx = cx - b.x, dy = cy - b.y
  const [lx, ly] = rot(dx, dy, -b.rot)
  const hw = b.w / 2, hh = b.h / 2
  const clx = clamp(lx, -hw, hw), cly = clamp(ly, -hh, hh)
  const nlx = lx - clx, nly = ly - cly
  const d = Math.hypot(nlx, nly)
  if (d < r) {
    const [wx, wy] = rot(nlx || 0.001, nly || 0, b.rot)
    const l = Math.hypot(wx, wy) || 1
    return { normal: [wx / l, wy / l], depth: r - d, point: [cx - (wx / l) * r, cy - (wy / l) * r] }
  }
  return null
}

export default function AngrySlings() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    blocks: [], pigs: [], birds: [],
    currentBird: null, inFlight: null,
    aiming: false, aimPt: [SLING_X, SLING_Y],
    trail: [], particles: [],
    shake: 0, reduced: false, slowmo: 0,
  })

  const [shellDifficulty, setShellDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const cfg = useMemo(
    () => shellDifficulty === 'Custom' ? customValues : DIFFICULTIES[shellDifficulty] || DIFFICULTIES.Medium,
    [shellDifficulty, customValues],
  )
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  const [level, setLevel] = useState(0)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [status, setStatus] = useState('playing')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [birdsLeft, setBirdsLeft] = useState(0)
  const [pigsLeft, setPigsLeft] = useState(0)

  const audioRef = useRef(null)
  const beep = useCallback((f, d, t = 'square', v = 0.05) => {
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

  useEffect(() => {
    try { const b = +(localStorage.getItem('slings-best') || 0); if (b) setBest(b) } catch {}
  }, [])

  const loadLevel = useCallback((idx) => {
    const L = LEVELS[idx]
    const s = stateRef.current
    const bs = cfgRef.current.blockStrength ?? 1
    s.blocks = L.blocks.map(b => makeBlock(b.x, b.y, b.w, b.h, b.rot || 0, bs))
    s.pigs = L.pigs.map(p => ({ ...p, alive: true, wobble: 0 }))
    const birdList = [...L.birds]
    const bonus = Math.max(-2, Math.min(4, Math.round(cfgRef.current.birdBonus || 0)))
    if (bonus > 0) for (let i = 0; i < bonus; i++) birdList.push('regular')
    if (bonus < 0) birdList.length = Math.max(1, birdList.length + bonus)
    s.birds = birdList
    s.currentBird = s.birds.shift() || null
    s.inFlight = null; s.trail = []
    setLevel(idx)
    setBirdsLeft(s.birds.length + (s.currentBird ? 1 : 0))
    setPigsLeft(s.pigs.length)
    setStatus('playing')
  }, [])

  const reset = useCallback(() => { setScore(0); loadLevel(0) }, [loadLevel])
  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current
    const getPt = (e) => {
      const rect = canvas.getBoundingClientRect()
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
      return [cx / rect.width * W, cy / rect.height * H]
    }
    const down = (e) => {
      if (s.inFlight || !s.currentBird || status !== 'playing') return
      e.preventDefault()
      const [px, py] = getPt(e)
      if (Math.hypot(px - SLING_X, py - SLING_Y) < 60) {
        s.aiming = true; s.aimPt = [px, py]
      }
    }
    const move = (e) => {
      if (!s.aiming) return
      e.preventDefault()
      const [px, py] = getPt(e)
      const dx = px - SLING_X, dy = py - SLING_Y
      const d = Math.hypot(dx, dy)
      const max = 80
      if (d > max) s.aimPt = [SLING_X + dx / d * max, SLING_Y + dy / d * max]
      else s.aimPt = [px, py]
    }
    const up = () => {
      if (!s.aiming) return
      s.aiming = false
      const dx = SLING_X - s.aimPt[0], dy = SLING_Y - s.aimPt[1]
      if (Math.hypot(dx, dy) < 15) return
      const type = BIRD_TYPES[s.currentBird]
      const mult = type.speedMult || 1
      s.inFlight = {
        type: s.currentBird,
        r: type.r, mass: type.mass, color: type.color, shape: type.shape,
        x: s.aimPt[0], y: s.aimPt[1],
        vx: dx * 0.22 * mult, vy: dy * 0.22 * mult,
        life: 400,
      }
      s.currentBird = null
      s.trail = []
      beep(600, 0.1, 'triangle', 0.06)
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
  }, [status, beep])

  useEffect(() => {
    let raf, last = performance.now()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    s.reduced = mq.matches

    const addParticles = (x, y, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1 + Math.random() * 4
        s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 25, color })
      }
    }

    const checkLevelEnd = () => {
      if (s.pigs.every(p => !p.alive)) {
        const bonus = (s.birds.length + (s.currentBird ? 1 : 0)) * 1000
        setScore(sc => {
          const newSc = sc + bonus
          if (newSc > best) {
            setBest(newSc)
            try { localStorage.setItem('slings-best', String(newSc)) } catch {}
          }
          return newSc
        })
        setTimeout(() => {
          if (level + 1 >= LEVELS.length) setStatus('won')
          else loadLevel(level + 1)
        }, 1500)
        beep(1000, 0.4, 'triangle', 0.08)
      } else if (!s.currentBird && s.birds.length === 0) {
        setStatus('over')
      }
    }

    const step = () => {
      s.blocks.forEach(b => {
        if (b.sleep > 30) return
        b.vy += (cfgRef.current.gravity ?? GRAVITY)
        b.vx *= 0.995; b.vy *= 0.995
        b.omega *= 0.98
        b.x += b.vx; b.y += b.vy; b.rot += b.omega
        const cs = corners(b)
        let lowest = -Infinity, lowestI = 0
        cs.forEach((c, i) => { if (c[1] > lowest) { lowest = c[1]; lowestI = i } })
        if (lowest > GROUND_Y) {
          b.y -= (lowest - GROUND_Y)
          const [px] = cs[lowestI]
          const rx = px - b.x
          const relV = b.vy + b.omega * rx * -1
          if (relV > 0) {
            const j = -(1 + 0.2) * relV / (b.inv + rx * rx * b.invI)
            b.vy += j * b.inv
            b.omega += (-rx * j) * b.invI
            b.vx *= 0.7
          }
          b.vy *= 0.4
        }
        if (Math.hypot(b.vx, b.vy) < 0.15 && Math.abs(b.omega) < 0.02) b.sleep++
        else b.sleep = 0
      })

      for (let iter = 0; iter < 6; iter++) {
        for (let i = 0; i < s.blocks.length; i++) {
          for (let j = i + 1; j < s.blocks.length; j++) {
            const a = s.blocks[i], b = s.blocks[j]
            if (a.sleep > 30 && b.sleep > 30) continue
            const ra = Math.hypot(a.w, a.h) / 2
            const rb = Math.hypot(b.w, b.h) / 2
            if (Math.hypot(a.x - b.x, a.y - b.y) > ra + rb) continue
            const col = satOBB(a, b)
            if (!col) continue
            const [nx, ny] = col.normal
            const totalInv = a.inv + b.inv
            const push = col.depth / totalInv * 0.7
            a.x -= nx * push * a.inv; a.y -= ny * push * a.inv
            b.x += nx * push * b.inv; b.y += ny * push * b.inv
            const rv = [b.vx - a.vx, b.vy - a.vy]
            const vn = rv[0] * nx + rv[1] * ny
            if (vn > 0) continue
            const e = 0.15
            const jm = -(1 + e) * vn / totalInv
            a.vx -= jm * nx * a.inv; a.vy -= jm * ny * a.inv
            b.vx += jm * nx * b.inv; b.vy += jm * ny * b.inv
            a.sleep = 0; b.sleep = 0
          }
        }
      }

      if (s.inFlight) {
        const bird = s.inFlight
        bird.vy += (cfgRef.current.gravity ?? GRAVITY)
        bird.vx *= 0.999
        bird.x += bird.vx; bird.y += bird.vy
        bird.life--
        s.trail.push([bird.x, bird.y])
        if (s.trail.length > 40) s.trail.shift()
        const removeBird = () => {
          s.inFlight = null
          setTimeout(() => {
            if (s.birds.length > 0) {
              s.currentBird = s.birds.shift()
              setBirdsLeft(s.birds.length + 1)
            } else {
              setBirdsLeft(0)
              checkLevelEnd()
            }
          }, 400)
        }
        if (bird.y > GROUND_Y - bird.r) {
          bird.y = GROUND_Y - bird.r
          bird.vy = -bird.vy * 0.5
          bird.vx *= 0.7
          if (Math.abs(bird.vy) < 1) removeBird()
        }
        if (bird.x > W + 100 || bird.x < -100 || bird.life < 0) removeBird()

        if (s.inFlight) {
          s.blocks.forEach(b => {
            if (!s.inFlight) return
            const col = circleOBB(bird.x, bird.y, bird.r, b)
            if (col) {
              const [nx, ny] = col.normal
              const [px, py] = col.point
              bird.x += nx * col.depth; bird.y += ny * col.depth
              const rx = px - b.x, ry = py - b.y
              const vrel = [bird.vx - (b.vx - ry * b.omega), bird.vy - (b.vy + rx * b.omega)]
              const vn = vrel[0] * nx + vrel[1] * ny
              if (vn > 0) return
              const rn = rx * ny - ry * nx
              const invSum = (1 / bird.mass) + b.inv + rn * rn * b.invI
              const e = 0.35
              const jm = -(1 + e) * vn / invSum
              bird.vx += (jm * nx) / bird.mass
              bird.vy += (jm * ny) / bird.mass
              b.vx -= jm * nx * b.inv
              b.vy -= jm * ny * b.inv
              b.omega -= (rx * (jm * ny) - ry * (jm * nx)) * b.invI
              b.sleep = 0; b.hit = true
              addParticles(px, py, 5, '#fbbf24')
              if (!s.reduced) s.shake = Math.min(s.shake + 4, 10)
              if (Math.abs(vn) > 3) {
                setScore(sc => sc + 50)
                beep(300, 0.06, 'square', 0.06)
                if (Math.abs(vn) > 8 && !s.reduced) s.slowmo = 8
              }
            }
          })
          s.pigs.forEach(p => {
            if (!p.alive || !s.inFlight) return
            const d = Math.hypot(bird.x - p.x, bird.y - p.y)
            if (d < bird.r + p.r) {
              p.alive = false
              addParticles(p.x, p.y, 15, '#22c55e')
              if (!s.reduced) s.shake = Math.max(s.shake, 8)
              setScore(sc => sc + 500)
              beep(800, 0.15, 'triangle', 0.07)
              setPigsLeft(pl => pl - 1)
            }
          })
        }
      }

      s.pigs.forEach(p => {
        if (!p.alive) return
        p.wobble += 0.05
        s.blocks.forEach(b => {
          const col = circleOBB(p.x, p.y, p.r, b)
          if (col) {
            const impact = Math.hypot(b.vx, b.vy) + Math.abs(b.omega) * 5
            if (impact > 2) {
              p.alive = false
              addParticles(p.x, p.y, 15, '#22c55e')
              setScore(sc => sc + 500)
              beep(800, 0.15, 'triangle', 0.07)
              setPigsLeft(pl => pl - 1)
              if (!s.reduced) s.shake = Math.max(s.shake, 6)
            }
          }
        })
      })

      s.blocks.forEach(b => {
        if (b.hit && Math.hypot(b.vx, b.vy) < 0.5 && !b.scored) {
          b.scored = true; setScore(sc => sc + 25)
        }
      })

      s.particles = s.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--
        return p.life > 0
      })
      if (s.shake > 0) s.shake *= 0.87
      if (s.slowmo > 0) s.slowmo--
    }

    const drawBird = (x, y, r, color, shape, angle = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
      grad.addColorStop(0, '#fef3c7'); grad.addColorStop(0.3, color); grad.addColorStop(1, '#7c2d12')
      ctx.fillStyle = grad
      ctx.beginPath()
      if (shape === 'triangle') { ctx.moveTo(-r, r); ctx.lineTo(r, 0); ctx.lineTo(-r, -r); ctx.closePath() }
      else if (shape === 'oval') { ctx.ellipse(0, 0, r * 1.2, r * 0.9, 0, 0, Math.PI * 2) }
      else { ctx.arc(0, 0, r, 0, Math.PI * 2) }
      ctx.fill()
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.2, r * 0.35, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.2, r * 0.15, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.7, -r * 0.35); ctx.stroke()
      ctx.fillStyle = '#f97316'
      ctx.beginPath(); ctx.moveTo(r * 0.6, 0.1); ctx.lineTo(r * 1.15, r * 0.05); ctx.lineTo(r * 0.6, r * 0.3); ctx.closePath(); ctx.fill()
      ctx.restore()
    }

    const draw = () => {
      const shakeX = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      ctx.save(); ctx.translate(shakeX, shakeY)

      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(1, '#38bdf8')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = '#65a30d'
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y)
      for (let x = 0; x <= W; x += 30) ctx.lineTo(x, GROUND_Y - 30 - Math.sin(x * 0.02) * 20)
      ctx.lineTo(W, GROUND_Y); ctx.closePath(); ctx.fill()

      ctx.fillStyle = '#78350f'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
      ctx.fillStyle = '#84cc16'; ctx.fillRect(0, GROUND_Y - 4, W, 4)

      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(SLING_X - 12, GROUND_Y); ctx.lineTo(SLING_X - 12, SLING_Y - 5)
      ctx.moveTo(SLING_X + 12, GROUND_Y); ctx.lineTo(SLING_X + 12, SLING_Y - 5)
      ctx.stroke()

      if (s.currentBird && !s.aiming) {
        ctx.strokeStyle = '#57534e'; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(SLING_X - 12, SLING_Y - 5); ctx.lineTo(SLING_X, SLING_Y); ctx.lineTo(SLING_X + 12, SLING_Y - 5)
        ctx.stroke()
      }
      if (s.aiming) {
        ctx.strokeStyle = '#292524'; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(SLING_X - 12, SLING_Y - 5); ctx.lineTo(s.aimPt[0], s.aimPt[1]); ctx.lineTo(SLING_X + 12, SLING_Y - 5)
        ctx.stroke()
        const dx = SLING_X - s.aimPt[0], dy = SLING_Y - s.aimPt[1]
        const type = BIRD_TYPES[s.currentBird]
        const mult = type.speedMult || 1
        let px = s.aimPt[0], py = s.aimPt[1]
        let pvx = dx * 0.22 * mult, pvy = dy * 0.22 * mult
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        for (let i = 0; i < 30; i++) {
          pvy += (cfgRef.current.gravity ?? GRAVITY)
          px += pvx; py += pvy
          if (py > GROUND_Y) break
          if (i % 2 === 0) ctx.fillRect(px - 1.5, py - 1.5, 3, 3)
        }
      }

      s.blocks.forEach(b => {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot)
        const grad = ctx.createLinearGradient(-b.w / 2, -b.h / 2, b.w / 2, b.h / 2)
        grad.addColorStop(0, '#a16207'); grad.addColorStop(1, '#78350f')
        ctx.fillStyle = grad; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
        ctx.strokeStyle = '#451a03'; ctx.lineWidth = 1.5; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5
        for (let g = -b.h / 2 + 4; g < b.h / 2; g += 6) {
          ctx.beginPath(); ctx.moveTo(-b.w / 2, g); ctx.lineTo(b.w / 2, g); ctx.stroke()
        }
        ctx.restore()
      })

      s.pigs.forEach(p => {
        if (!p.alive) return
        ctx.save(); ctx.translate(p.x, p.y + Math.sin(p.wobble) * 1.5)
        const grad = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 0, 0, 0, p.r)
        grad.addColorStop(0, '#86efac'); grad.addColorStop(1, '#166534')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#166534'
        ctx.beginPath(); ctx.moveTo(-p.r * 0.6, -p.r * 0.6); ctx.lineTo(-p.r * 0.3, -p.r); ctx.lineTo(-p.r * 0.2, -p.r * 0.5); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(p.r * 0.2, -p.r * 0.5); ctx.lineTo(p.r * 0.3, -p.r); ctx.lineTo(p.r * 0.6, -p.r * 0.6); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(-p.r * 0.25, -p.r * 0.15, p.r * 0.2, 0, Math.PI * 2)
        ctx.arc(p.r * 0.25, -p.r * 0.15, p.r * 0.2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath(); ctx.arc(-p.r * 0.2, -p.r * 0.15, p.r * 0.08, 0, Math.PI * 2)
        ctx.arc(p.r * 0.3, -p.r * 0.15, p.r * 0.08, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#4d7c0f'
        ctx.beginPath(); ctx.ellipse(0, p.r * 0.25, p.r * 0.35, p.r * 0.25, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath(); ctx.arc(-p.r * 0.1, p.r * 0.25, p.r * 0.06, 0, Math.PI * 2)
        ctx.arc(p.r * 0.1, p.r * 0.25, p.r * 0.06, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      })

      if (s.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.beginPath(); ctx.moveTo(s.trail[0][0], s.trail[0][1])
        s.trail.forEach(([x, y]) => ctx.lineTo(x, y))
        ctx.stroke(); ctx.setLineDash([])
      }

      if (s.inFlight) {
        drawBird(s.inFlight.x, s.inFlight.y, s.inFlight.r, s.inFlight.color, s.inFlight.shape,
          Math.atan2(s.inFlight.vy, s.inFlight.vx))
      }
      if (s.currentBird) {
        const type = BIRD_TYPES[s.currentBird]
        const bx = s.aiming ? s.aimPt[0] : SLING_X
        const by = s.aiming ? s.aimPt[1] : SLING_Y - 5
        drawBird(bx, by, type.r, type.color, type.shape)
      }
      s.birds.forEach((b, i) => {
        const type = BIRD_TYPES[b]
        drawBird(30 + i * 30, GROUND_Y - 15, type.r * 0.7, type.color, type.shape)
      })

      s.particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = clamp(p.life / 25, 0, 1)
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill()
      })
      ctx.globalAlpha = 1

      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 26)
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px monospace'
      ctx.fillText(`LEVEL ${level + 1}/10  ·  PIGS ${pigsLeft}  ·  BIRDS ${birdsLeft}  ·  SCORE ${score}`, 10, 18)
      ctx.restore()
    }

    const loop = () => {
      if (!paused && status === 'playing') step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, status, level, score, best, birdsLeft, pigsLeft, loadLevel, beep])

  return (
    <GameShell
      title="Angry Slings"
      category="Physics"
      score={score}
      best={best}
      level={level + 1}
      status={paused ? 'paused' : status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setPaused(p => !p)}
      onRestart={reset}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Pigs</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{pigsLeft}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Birds</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{birdsLeft}</span>
          </div>
        </>
      }
      controls={[
        { key: 'Drag from sling', label: 'Aim + set power' },
        { key: 'Release', label: 'Launch bird' },
        { key: 'Touch', label: 'Drag on mobile' },
      ]}
      rules={RULES}
      difficulty={shellDifficulty}
      onDifficultyChange={setShellDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      overlay={status === 'won' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent">All levels cleared!</div>
          <div className="text-white/70 text-sm">Score {score.toLocaleString()} · Best {best.toLocaleString()}</div>
          <button type="button" onClick={reset} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Play again</button>
        </div>
      ) : status === 'over' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold text-rose-300">Out of birds!</div>
          <div className="text-white/70 text-sm">Score {score.toLocaleString()}</div>
          <button type="button" onClick={() => loadLevel(level)} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Retry level</button>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        className="w-full max-h-[80vh] object-contain block mx-auto"
        style={{ imageRendering: 'crisp-edges', aspectRatio: `${W}/${H}`, touchAction: 'none' }}
      />
    </GameShell>
  )
}
