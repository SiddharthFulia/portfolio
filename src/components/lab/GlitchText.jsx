import { useState, useEffect, useRef, useCallback } from 'react'

const FONT_OPTIONS = [
  { name: 'Mono', value: "'Courier New', monospace" },
  { name: 'Sans', value: "'Arial Black', sans-serif" },
  { name: 'Serif', value: "'Georgia', serif" },
  { name: 'Impact', value: "'Impact', sans-serif" },
]

const THEMES = [
  { name: 'Cyberpunk', bg: '#0a0a0a', color: '#fff', glitch1: '#ff0040', glitch2: '#0ff', scanline: true },
  { name: 'Matrix', bg: '#000800', color: '#00ff41', glitch1: '#00ff41', glitch2: '#00aa28', scanline: true },
  { name: 'Vaporwave', bg: '#1a0030', color: '#ff71ce', glitch1: '#01cdfe', glitch2: '#b967ff', scanline: false },
  { name: 'Terminal', bg: '#0c0c0c', color: '#f0a000', glitch1: '#f0a000', glitch2: '#805500', scanline: true },
]

const GlitchText = () => {
  const [text, setText] = useState('GLITCH')
  const [intensity, setIntensity] = useState(50)
  const [fontSize, setFontSize] = useState(64)
  const [fontIdx, setFontIdx] = useState(0)
  const [themeIdx, setThemeIdx] = useState(0)
  const [glitching, setGlitching] = useState(true)
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const timeRef = useRef(0)

  const theme = THEMES[themeIdx]
  const font = FONT_OPTIONS[fontIdx]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    timeRef.current++
    const t = timeRef.current
    const intFactor = intensity / 100

    // Clear
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)

    // Scanlines
    if (theme.scanline) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1)
      }
    }

    const displayText = text || 'TYPE...'
    ctx.font = `bold ${fontSize}px ${font.value}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (glitching && Math.random() < 0.1 * intFactor) {
      // Glitch frame — RGB split
      const offsetX = (Math.random() - 0.5) * 20 * intFactor
      const offsetY = (Math.random() - 0.5) * 10 * intFactor

      // Red channel
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = theme.glitch1 + '88'
      ctx.fillText(displayText, w / 2 + offsetX, h / 2 + offsetY)

      // Cyan channel
      ctx.fillStyle = theme.glitch2 + '88'
      ctx.fillText(displayText, w / 2 - offsetX, h / 2 - offsetY)

      ctx.globalCompositeOperation = 'source-over'

      // Slice effect
      if (Math.random() < 0.3 * intFactor) {
        const sliceY = Math.random() * h
        const sliceH = 5 + Math.random() * 30 * intFactor
        const sliceOffset = (Math.random() - 0.5) * 40 * intFactor
        const imageData = ctx.getImageData(0, sliceY, w, sliceH)
        ctx.putImageData(imageData, sliceOffset, sliceY)
      }
    }

    // Main text
    ctx.fillStyle = theme.color
    ctx.shadowColor = theme.glitch1
    ctx.shadowBlur = glitching ? 4 + Math.sin(t * 0.1) * 3 * intFactor : 4
    ctx.fillText(displayText, w / 2, h / 2)
    ctx.shadowBlur = 0

    // Flicker bar
    if (glitching && Math.random() < 0.05 * intFactor) {
      const barY = Math.random() * h
      ctx.fillStyle = theme.glitch1 + '20'
      ctx.fillRect(0, barY, w, 2 + Math.random() * 8)
    }

    // Static noise
    if (glitching && intFactor > 0.3) {
      const noiseAmount = Math.floor(50 * intFactor)
      for (let i = 0; i < noiseAmount; i++) {
        const x = Math.random() * w
        const y = Math.random() * h
        const brightness = Math.random() * 255
        ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},${0.05 * intFactor})`
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1)
      }
    }

    // VHS tracking lines
    if (glitching && intFactor > 0.5 && Math.random() < 0.02) {
      const trackY = (t * 2) % h
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fillRect(0, trackY, w, 20)
    }

    animRef.current = requestAnimationFrame(draw)
  }, [text, intensity, fontSize, font, theme, glitching])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 220

    const handleResize = () => {
      const r = canvas.parentElement.getBoundingClientRect()
      canvas.width = r.width
      canvas.height = 220
    }
    window.addEventListener('resize', handleResize)
    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [draw])

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-gray-700">
        <canvas ref={canvasRef} className="w-full block" />
      </div>

      {/* Text input */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Your Text</label>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value.toUpperCase())}
          maxLength={20}
          placeholder="TYPE SOMETHING..."
          className="w-full bg-gray-900 text-white text-lg font-mono px-4 py-3 rounded-xl border border-gray-700 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/30 transition-colors"
        />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Glitch Intensity</span>
            <span className="text-xs text-pink-400 font-mono">{intensity}%</span>
          </div>
          <input
            type="range" min="0" max="100" value={intensity}
            onChange={e => setIntensity(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Font Size</span>
            <span className="text-xs text-pink-400 font-mono">{fontSize}px</span>
          </div>
          <input
            type="range" min="24" max={120} value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
        </div>
      </div>

      {/* Font + theme selectors */}
      <div className="flex flex-wrap gap-2">
        {FONT_OPTIONS.map((f, i) => (
          <button
            key={f.name}
            onClick={() => setFontIdx(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              fontIdx === i ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f.name}
          </button>
        ))}
        <div className="w-px bg-gray-700 mx-1" />
        <button
          onClick={() => setGlitching(g => !g)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
            glitching ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'
          }`}
        >
          {glitching ? 'Glitch ON' : 'Glitch OFF'}
        </button>
      </div>

      {/* Themes */}
      <div className="flex flex-wrap gap-2">
        {THEMES.map((th, i) => (
          <button
            key={th.name}
            onClick={() => setThemeIdx(i)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
              themeIdx === i
                ? 'bg-gray-700 text-white border border-gray-500'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <div className="flex gap-0.5">
              <div className="w-2 h-2 rounded-full" style={{ background: th.color }} />
              <div className="w-2 h-2 rounded-full" style={{ background: th.glitch1 }} />
            </div>
            {th.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default GlitchText
