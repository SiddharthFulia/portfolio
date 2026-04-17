import { useState, useRef, useEffect, useCallback } from 'react'

const WAVE_TYPES = ['sine', 'triangle', 'square', 'sawtooth']
const COLOR_SCHEMES = [
  { name: 'Neon Cyan', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.15)', bg: '#0a0a1a' },
  { name: 'Sunset', stroke: '#f97316', fill: 'rgba(249,115,22,0.15)', bg: '#1a0a0a' },
  { name: 'Electric Purple', stroke: '#a855f7', fill: 'rgba(168,85,247,0.15)', bg: '#0f0a1a' },
  { name: 'Emerald', stroke: '#10b981', fill: 'rgba(16,185,129,0.15)', bg: '#0a1a10' },
  { name: 'Hot Pink', stroke: '#ec4899', fill: 'rgba(236,72,153,0.15)', bg: '#1a0a12' },
]

const WaveGenerator = () => {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const timeRef = useRef(0)

  const [amplitude, setAmplitude] = useState(60)
  const [frequency, setFrequency] = useState(2)
  const [speed, setSpeed] = useState(1.5)
  const [waveType, setWaveType] = useState('sine')
  const [layers, setLayers] = useState(3)
  const [scheme, setScheme] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showGrid, setShowGrid] = useState(true)

  const getWaveY = useCallback((x, t, type, amp, freq) => {
    const phase = x * freq * 0.02 + t
    switch (type) {
      case 'triangle': {
        const p = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        return amp * (2 * Math.abs(2 * (p / (Math.PI * 2)) - 1) - 1)
      }
      case 'square':
        return amp * (Math.sin(phase) >= 0 ? 1 : -1) * 0.8
      case 'sawtooth': {
        const p = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        return amp * (2 * (p / (Math.PI * 2)) - 1)
      }
      default:
        return amp * Math.sin(phase)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const colors = COLOR_SCHEMES[scheme]

    const draw = () => {
      if (!paused) timeRef.current += 0.02 * speed
      const t = timeRef.current
      const w = canvas.width
      const h = canvas.height
      const midY = h / 2

      ctx.fillStyle = colors.bg
      ctx.fillRect(0, 0, w, h)

      // Grid
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 1
        for (let x = 0; x < w; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
        }
        for (let y = 0; y < h; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
        }
        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke()
      }

      // Draw wave layers
      for (let layer = 0; layer < layers; layer++) {
        const layerOpacity = 1 - layer * 0.25
        const layerAmp = amplitude * (1 - layer * 0.2)
        const layerFreq = frequency * (1 + layer * 0.3)
        const layerOffset = layer * 0.5

        // Fill
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 2) {
          const y = midY + getWaveY(x, t + layerOffset, waveType, layerAmp, layerFreq)
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fillStyle = colors.fill.replace(/[\d.]+\)$/, `${0.1 * layerOpacity})`)
        ctx.fill()

        // Stroke
        ctx.beginPath()
        for (let x = 0; x <= w; x += 2) {
          const y = midY + getWaveY(x, t + layerOffset, waveType, layerAmp, layerFreq)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = colors.stroke + Math.round(layerOpacity * 255).toString(16).padStart(2, '0')
        ctx.lineWidth = 2.5 - layer * 0.5
        ctx.stroke()

        // Glow
        ctx.shadowColor = colors.stroke
        ctx.shadowBlur = 12 * layerOpacity
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      animRef.current = requestAnimationFrame(draw)
    }

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = 280
    }
    resize()
    window.addEventListener('resize', resize)
    animRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [amplitude, frequency, speed, waveType, layers, scheme, paused, showGrid, getWaveY])

  const Control = ({ label, value, min, max, step = 1, onChange, unit = '' }) => (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-cyan-400 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-gray-700">
        <canvas ref={canvasRef} className="w-full block" />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Control label="Amplitude" value={amplitude} min={10} max={120} onChange={setAmplitude} unit="px" />
        <Control label="Frequency" value={frequency} min={0.5} max={8} step={0.5} onChange={setFrequency} unit="Hz" />
        <Control label="Speed" value={speed} min={0.1} max={5} step={0.1} onChange={setSpeed} unit="x" />
        <Control label="Layers" value={layers} min={1} max={5} onChange={setLayers} />
      </div>

      {/* Wave type + scheme */}
      <div className="flex flex-wrap gap-2">
        {WAVE_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setWaveType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              waveType === t
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div className="w-px bg-gray-700 mx-1" />
        <button
          onClick={() => setPaused(p => !p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
            paused ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          onClick={() => setShowGrid(g => !g)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
            showGrid ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'
          }`}
        >
          Grid
        </button>
      </div>

      {/* Color schemes */}
      <div className="flex flex-wrap gap-2">
        {COLOR_SCHEMES.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setScheme(i)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
              scheme === i
                ? 'bg-gray-700 text-white border border-gray-500'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <div className="w-3 h-3 rounded-full" style={{ background: c.stroke }} />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default WaveGenerator
