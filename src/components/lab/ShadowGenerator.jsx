import { useState, useCallback } from 'react'

const PRESETS = [
  { name: 'Soft Lift', shadows: [{ x: 0, y: 10, blur: 30, spread: -5, color: '#00000040', inset: false }] },
  { name: 'Hard Drop', shadows: [{ x: 8, y: 8, blur: 0, spread: 0, color: '#00000060', inset: false }] },
  { name: 'Neon Glow', shadows: [
    { x: 0, y: 0, blur: 10, spread: 0, color: '#22d3ee80', inset: false },
    { x: 0, y: 0, blur: 30, spread: 5, color: '#22d3ee40', inset: false },
    { x: 0, y: 0, blur: 60, spread: 10, color: '#22d3ee20', inset: false },
  ]},
  { name: 'Neumorphism', shadows: [
    { x: 8, y: 8, blur: 16, spread: 0, color: '#00000060', inset: false },
    { x: -8, y: -8, blur: 16, spread: 0, color: '#ffffff08', inset: false },
  ]},
  { name: 'Inner Light', shadows: [
    { x: 0, y: 0, blur: 20, spread: -5, color: '#a855f760', inset: true },
  ]},
  { name: 'Layered', shadows: [
    { x: 0, y: 1, blur: 2, spread: 0, color: '#00000020', inset: false },
    { x: 0, y: 4, blur: 8, spread: 0, color: '#00000018', inset: false },
    { x: 0, y: 12, blur: 24, spread: 0, color: '#00000012', inset: false },
    { x: 0, y: 24, blur: 48, spread: 0, color: '#0000000a', inset: false },
  ]},
]

const DEFAULT_SHADOW = { x: 0, y: 8, blur: 24, spread: 0, color: '#22d3ee60', inset: false }

const ShadowGenerator = () => {
  const [shadows, setShadows] = useState([{ ...DEFAULT_SHADOW }])
  const [bgColor, setBgColor] = useState('#111827')
  const [boxColor, setBoxColor] = useState('#1f2937')
  const [borderRadius, setBorderRadius] = useState(16)
  const [boxSize, setBoxSize] = useState(180)
  const [copied, setCopied] = useState(false)

  const addShadow = () => {
    if (shadows.length >= 6) return
    setShadows(prev => [...prev, { ...DEFAULT_SHADOW, color: '#a855f740' }])
  }

  const removeShadow = (i) => {
    if (shadows.length <= 1) return
    setShadows(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateShadow = (i, key, val) => {
    setShadows(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))
  }

  const getCSS = useCallback(() => {
    return shadows.map(s =>
      `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`
    ).join(',\n    ')
  }, [shadows])

  const copyCSS = () => {
    const css = `box-shadow: ${getCSS()};`
    navigator.clipboard.writeText(css).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const applyPreset = (preset) => {
    setShadows(preset.shadows.map(s => ({ ...s })))
  }

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div
        className="w-full h-64 rounded-xl border border-gray-700 flex items-center justify-center transition-colors duration-300"
        style={{ background: bgColor }}
      >
        <div
          className="transition-all duration-300 flex items-center justify-center"
          style={{
            width: boxSize,
            height: boxSize,
            background: boxColor,
            borderRadius,
            boxShadow: getCSS(),
          }}
        >
          <span className="text-gray-400 text-xs font-mono">Preview</span>
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
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Box controls */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Background</label>
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
            className="w-full h-9 rounded cursor-pointer bg-transparent border border-gray-700" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Box Color</label>
          <input type="color" value={boxColor} onChange={e => setBoxColor(e.target.value)}
            className="w-full h-9 rounded cursor-pointer bg-transparent border border-gray-700" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Radius</span>
            <span className="text-xs text-cyan-400 font-mono">{borderRadius}px</span>
          </div>
          <input type="range" min="0" max="90" value={borderRadius}
            onChange={e => setBorderRadius(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Size</span>
            <span className="text-xs text-cyan-400 font-mono">{boxSize}px</span>
          </div>
          <input type="range" min="80" max="260" value={boxSize}
            onChange={e => setBoxSize(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
        </div>
      </div>

      {/* Shadow layers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Shadow Layers ({shadows.length}/6)</span>
          <button
            onClick={addShadow}
            disabled={shadows.length >= 6}
            className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 text-cyan-400 rounded-lg disabled:opacity-30 transition-colors"
          >
            + Add Layer
          </button>
        </div>

        {shadows.map((s, i) => (
          <div key={i} className="bg-gray-900/80 rounded-xl border border-gray-700 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-mono">Layer {i + 1}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => updateShadow(i, 'inset', !s.inset)}
                  className={`text-xs px-2 py-0.5 rounded ${s.inset ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-500'}`}
                >
                  Inset
                </button>
                {shadows.length > 1 && (
                  <button onClick={() => removeShadow(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'X', key: 'x', min: -50, max: 50 },
                { label: 'Y', key: 'y', min: -50, max: 50 },
                { label: 'Blur', key: 'blur', min: 0, max: 100 },
                { label: 'Spread', key: 'spread', min: -30, max: 30 },
              ].map(ctrl => (
                <div key={ctrl.key}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-gray-500">{ctrl.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{s[ctrl.key]}</span>
                  </div>
                  <input type="range" min={ctrl.min} max={ctrl.max} value={s[ctrl.key]}
                    onChange={e => updateShadow(i, ctrl.key, Number(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
              ))}
              <div>
                <span className="text-[10px] text-gray-500 block mb-0.5">Color</span>
                <input type="color" value={s.color.slice(0, 7)}
                  onChange={e => updateShadow(i, 'color', e.target.value + s.color.slice(7))}
                  className="w-full h-6 rounded cursor-pointer bg-transparent border border-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CSS output */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 font-mono">CSS Output</span>
          <button
            onClick={copyCSS}
            className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all ${
              copied ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy CSS'}
          </button>
        </div>
        <code className="text-xs text-cyan-300 font-mono break-all whitespace-pre-wrap">
          box-shadow: {getCSS()};
        </code>
      </div>
    </div>
  )
}

export default ShadowGenerator
