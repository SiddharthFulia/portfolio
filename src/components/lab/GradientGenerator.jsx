import { useState, useCallback, useRef } from 'react'

const PRESETS = [
  { name: 'Sunset', colors: ['#ff6b6b', '#feca57', '#ff9ff3'], angle: 135 },
  { name: 'Ocean', colors: ['#0abde3', '#10ac84', '#01a3a4'], angle: 90 },
  { name: 'Aurora', colors: ['#a29bfe', '#6c5ce7', '#fd79a8'], angle: 180 },
  { name: 'Fire', colors: ['#e17055', '#d63031', '#fdcb6e'], angle: 45 },
  { name: 'Neon', colors: ['#00ff87', '#60efff', '#ff00e5'], angle: 120 },
  { name: 'Midnight', colors: ['#0c0c1d', '#1a1a4e', '#3d3d93'], angle: 160 },
]

const GradientGenerator = () => {
  const [colors, setColors] = useState(['#6366f1', '#ec4899', '#f59e0b'])
  const [angle, setAngle] = useState(135)
  const [gradType, setGradType] = useState('linear') // linear | radial | conic
  const [copied, setCopied] = useState(false)
  const previewRef = useRef()

  const addColor = () => {
    if (colors.length >= 6) return
    const hue = Math.floor(Math.random() * 360)
    setColors(prev => [...prev, `hsl(${hue}, 70%, 55%)`])
  }

  const removeColor = (i) => {
    if (colors.length <= 2) return
    setColors(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateColor = (i, val) => {
    setColors(prev => prev.map((c, idx) => idx === i ? val : c))
  }

  const getGradientCSS = useCallback(() => {
    const stops = colors.join(', ')
    if (gradType === 'radial') return `radial-gradient(circle, ${stops})`
    if (gradType === 'conic') return `conic-gradient(from ${angle}deg, ${stops})`
    return `linear-gradient(${angle}deg, ${stops})`
  }, [colors, angle, gradType])

  const copyCSS = () => {
    const css = `background: ${getGradientCSS()};`
    navigator.clipboard.writeText(css).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const applyPreset = (preset) => {
    setColors([...preset.colors])
    setAngle(preset.angle)
  }

  const randomize = () => {
    const count = 2 + Math.floor(Math.random() * 3)
    const newColors = Array.from({ length: count }, () => {
      const h = Math.floor(Math.random() * 360)
      const s = 50 + Math.floor(Math.random() * 40)
      const l = 40 + Math.floor(Math.random() * 30)
      return `hsl(${h}, ${s}%, ${l}%)`
    })
    setColors(newColors)
    setAngle(Math.floor(Math.random() * 360))
  }

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div
        ref={previewRef}
        className="w-full h-56 rounded-xl border border-gray-700 transition-all duration-500"
        style={{ background: getGradientCSS() }}
      />

      {/* Gradient type selector */}
      <div className="flex gap-2">
        {['linear', 'radial', 'conic'].map(t => (
          <button
            key={t}
            onClick={() => setGradType(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              gradType === t
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Angle slider */}
      {gradType !== 'radial' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">
            {gradType === 'conic' ? 'Start Angle' : 'Direction'}: {angle}°
          </label>
          <input
            type="range"
            min="0"
            max="360"
            value={angle}
            onChange={e => setAngle(Number(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      )}

      {/* Color stops */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Color Stops ({colors.length}/6)</span>
          <button
            onClick={addColor}
            disabled={colors.length >= 6}
            className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 text-cyan-400 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            + Add Color
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2 border border-gray-700">
              <input
                type="color"
                value={c.startsWith('#') ? c : '#6366f1'}
                onChange={e => updateColor(i, e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              />
              <input
                type="text"
                value={c}
                onChange={e => updateColor(i, e.target.value)}
                className="w-20 bg-gray-900 text-white text-xs font-mono px-2 py-1 rounded border border-gray-700 focus:border-indigo-500 focus:outline-none"
              />
              {colors.length > 2 && (
                <button
                  onClick={() => removeColor(i)}
                  className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div>
        <span className="text-xs text-gray-400 mb-2 block">Presets</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors group"
            >
              <div
                className="w-4 h-4 rounded-full border border-gray-600"
                style={{ background: `linear-gradient(135deg, ${p.colors.join(', ')})` }}
              />
              <span className="text-xs text-gray-400 group-hover:text-white">{p.name}</span>
            </button>
          ))}
          <button
            onClick={randomize}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-yellow-400 rounded-lg text-xs font-semibold transition-colors"
          >
            Randomize
          </button>
        </div>
      </div>

      {/* CSS output */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 font-mono">CSS Output</span>
          <button
            onClick={copyCSS}
            className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy CSS'}
          </button>
        </div>
        <code className="text-sm text-cyan-300 font-mono break-all">
          background: {getGradientCSS()};
        </code>
      </div>
    </div>
  )
}

export default GradientGenerator
