import { useRef, useEffect, useState, useCallback } from 'react'

const MODES = [
  { name: 'Attract', desc: 'Click to create gravity wells' },
  { name: 'Repel', desc: 'Click to push particles away' },
  { name: 'Spawn', desc: 'Click to spawn particle bursts' },
  { name: 'Trail', desc: 'Move mouse to leave particle trails' },
]

const PALETTES = [
  { name: 'Neon', colors: ['#00ffff', '#ff00ff', '#ffff00', '#00ff00', '#ff6600'] },
  { name: 'Pastel', colors: ['#ffb3ba', '#bae1ff', '#baffc9', '#ffffba', '#e8baff'] },
  { name: 'Fire', colors: ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00'] },
  { name: 'Ice', colors: ['#e0f7ff', '#87ceeb', '#4fc3f7', '#0288d1', '#01579b'] },
  { name: 'Mono', colors: ['#ffffff', '#cccccc', '#999999', '#666666', '#ffffff'] },
]

class Particle {
  constructor(x, y, vx, vy, color, size) {
    this.x = x; this.y = y
    this.vx = vx; this.vy = vy
    this.color = color
    this.size = size
    this.life = 1
    this.decay = 0.002 + Math.random() * 0.005
    this.origSize = size
  }

  update(wells, mode, gravity) {
    for (const w of wells) {
      const dx = w.x - this.x
      const dy = w.y - this.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 1
      const force = (w.strength * gravity) / (dist * dist) * (mode === 'Repel' ? -1 : 1)
      this.vx += (dx / dist) * force
      this.vy += (dy / dist) * force
    }

    this.vx *= 0.99
    this.vy *= 0.99
    this.x += this.vx
    this.y += this.vy
    this.life -= this.decay
    this.size = this.origSize * Math.max(0, this.life)
  }

  draw(ctx) {
    if (this.life <= 0) return
    ctx.globalAlpha = this.life * 0.8
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()

    // Glow
    ctx.shadowColor = this.color
    ctx.shadowBlur = this.size * 3
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }
}

const ParticlePlayground = () => {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const wellsRef = useRef([])
  const animRef = useRef(null)
  const mouseRef = useRef({ x: 0, y: 0, down: false })

  const [mode, setMode] = useState('Attract')
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [particleCount, setParticleCount] = useState(0)
  const [maxParticles, setMaxParticles] = useState(800)
  const [particleSize, setParticleSize] = useState(3)
  const [gravity, setGravity] = useState(50)
  const [showConnections, setShowConnections] = useState(false)

  const palette = PALETTES[paletteIdx]

  const randomColor = useCallback(() => {
    return palette.colors[Math.floor(Math.random() * palette.colors.length)]
  }, [palette])

  const spawnBurst = useCallback((x, y, count = 30) => {
    const particles = particlesRef.current
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1 + Math.random() * 4
      particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        randomColor(),
        particleSize * (0.5 + Math.random())
      ))
    }
    while (particles.length > maxParticles) particles.shift()
  }, [randomColor, maxParticles, particleSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = 380
    }
    resize()
    window.addEventListener('resize', resize)

    // Seed initial particles
    for (let i = 0; i < 100; i++) {
      particlesRef.current.push(new Particle(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        randomColor(),
        particleSize * (0.5 + Math.random())
      ))
    }

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      const particles = particlesRef.current
      const wells = wellsRef.current

      // Fade trail
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(0, 0, w, h)

      // Trail mode: spawn particles at mouse while down
      if (mode === 'Trail' && mouseRef.current.down) {
        const { x, y } = mouseRef.current
        for (let i = 0; i < 5; i++) {
          particles.push(new Particle(
            x + (Math.random() - 0.5) * 10,
            y + (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            randomColor(),
            particleSize * (0.5 + Math.random())
          ))
        }
        while (particles.length > maxParticles) particles.shift()
      }

      // Update & draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.update(wells, mode, gravity * 0.5)
        if (p.life <= 0 || p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
          particles.splice(i, 1)
          continue
        }
        p.draw(ctx)
      }

      // Connection lines
      if (showConnections && particles.length < 300) {
        ctx.strokeStyle = palette.colors[0] + '15'
        ctx.lineWidth = 0.5
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x
            const dy = particles[i].y - particles[j].y
            const dist = dx * dx + dy * dy
            if (dist < 4000) {
              ctx.globalAlpha = (1 - dist / 4000) * particles[i].life * particles[j].life * 0.5
              ctx.beginPath()
              ctx.moveTo(particles[i].x, particles[i].y)
              ctx.lineTo(particles[j].x, particles[j].y)
              ctx.stroke()
            }
          }
        }
        ctx.globalAlpha = 1
      }

      // Draw gravity wells
      for (let i = wells.length - 1; i >= 0; i--) {
        const w2 = wells[i]
        w2.life -= 0.005
        if (w2.life <= 0) { wells.splice(i, 1); continue }

        ctx.globalAlpha = w2.life * 0.5
        ctx.strokeStyle = mode === 'Repel' ? '#ff4444' : '#44aaff'
        ctx.lineWidth = 1.5
        const radius = 15 + (1 - w2.life) * 40
        ctx.beginPath()
        ctx.arc(w2.x, w2.y, radius, 0, Math.PI * 2)
        ctx.stroke()

        ctx.fillStyle = mode === 'Repel' ? '#ff4444' : '#44aaff'
        ctx.beginPath()
        ctx.arc(w2.x, w2.y, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      setParticleCount(particles.length)
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [mode, palette, maxParticles, particleSize, gravity, showConnections, randomColor])

  const handleCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (mode === 'Spawn') {
      spawnBurst(x, y, 40)
    } else if (mode === 'Attract' || mode === 'Repel') {
      wellsRef.current.push({ x, y, strength: 800, life: 1 })
      spawnBurst(x, y, 15)
    }
  }, [mode, spawnBurst])

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, down: true }
    handleCanvasClick(e)
  }, [handleCanvasClick])

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    mouseRef.current.x = e.clientX - rect.left
    mouseRef.current.y = e.clientY - rect.top
  }, [])

  const handleMouseUp = useCallback(() => {
    mouseRef.current.down = false
  }, [])

  const clearAll = () => {
    particlesRef.current = []
    wellsRef.current = []
  }

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-gray-700 cursor-crosshair relative">
        <canvas
          ref={canvasRef}
          className="w-full block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <div className="absolute top-3 right-3 text-xs text-gray-500 font-mono bg-black/50 px-2 py-1 rounded">
          {particleCount} particles
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {MODES.map(m => (
          <button
            key={m.name}
            onClick={() => setMode(m.name)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === m.name
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title={m.desc}
          >
            {m.name}
          </button>
        ))}
        <button
          onClick={clearAll}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-red-400 hover:bg-gray-700 transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={() => setShowConnections(c => !c)}
          className={`px-3 py-2 rounded-lg text-xs font-semibold ${
            showConnections ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500'
          }`}
        >
          Lines
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Max Particles</span>
            <span className="text-xs text-cyan-400 font-mono">{maxParticles}</span>
          </div>
          <input type="range" min="100" max="2000" step="100" value={maxParticles}
            onChange={e => setMaxParticles(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Particle Size</span>
            <span className="text-xs text-cyan-400 font-mono">{particleSize}px</span>
          </div>
          <input type="range" min="1" max="8" value={particleSize}
            onChange={e => setParticleSize(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Gravity</span>
            <span className="text-xs text-cyan-400 font-mono">{gravity}</span>
          </div>
          <input type="range" min="0" max="200" value={gravity}
            onChange={e => setGravity(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
        </div>
      </div>

      {/* Palettes */}
      <div className="flex flex-wrap gap-2">
        {PALETTES.map((p, i) => (
          <button
            key={p.name}
            onClick={() => setPaletteIdx(i)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
              paletteIdx === i
                ? 'bg-gray-700 text-white border border-gray-500'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <div className="flex gap-0.5">
              {p.colors.slice(0, 3).map((c, j) => (
                <div key={j} className="w-2 h-2 rounded-full" style={{ background: c }} />
              ))}
            </div>
            {p.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-600 text-center">
        {MODES.find(m => m.name === mode)?.desc}
      </p>
    </div>
  )
}

export default ParticlePlayground
