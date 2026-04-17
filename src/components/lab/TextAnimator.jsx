import { useState, useEffect, useRef, useCallback } from 'react'

const EFFECTS = [
  { name: 'Typewriter', id: 'typewriter' },
  { name: 'Wave', id: 'wave' },
  { name: 'Bounce', id: 'bounce' },
  { name: 'Fade In', id: 'fadeIn' },
  { name: 'Rainbow', id: 'rainbow' },
  { name: 'Scramble', id: 'scramble' },
  { name: 'Elastic', id: 'elastic' },
  { name: 'Karaoke', id: 'karaoke' },
]

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'

const TextAnimator = () => {
  const [text, setText] = useState('Hello World!')
  const [effect, setEffect] = useState('typewriter')
  const [speed, setSpeed] = useState(50)
  const [color1, setColor1] = useState('#22d3ee')
  const [color2, setColor2] = useState('#a855f7')
  const [playing, setPlaying] = useState(false)
  const [tick, setTick] = useState(0)
  const [scrambleChars, setScrambleChars] = useState([])
  const [typedCount, setTypedCount] = useState(0)
  const intervalRef = useRef(null)
  const displayRef = useRef(null)

  const resetAnimation = useCallback(() => {
    setTick(0)
    setTypedCount(0)
    setScrambleChars(text.split('').map(() => CHARS[Math.floor(Math.random() * CHARS.length)]))
  }, [text])

  const startAnimation = useCallback(() => {
    resetAnimation()
    setPlaying(true)
  }, [resetAnimation])

  useEffect(() => {
    if (!playing) return
    const interval = Math.max(10, 150 - speed * 1.4)

    intervalRef.current = setInterval(() => {
      setTick(t => {
        const next = t + 1
        // Stop conditions
        if (effect === 'typewriter' && next > text.length + 5) {
          setPlaying(false)
          return t
        }
        if (effect === 'scramble' && next > text.length * 3) {
          setPlaying(false)
          return t
        }
        if (['fadeIn', 'bounce', 'elastic', 'karaoke'].includes(effect) && next > text.length + 10) {
          setPlaying(false)
          return t
        }
        return next
      })

      if (effect === 'typewriter') {
        setTypedCount(c => Math.min(c + 1, text.length))
      }

      if (effect === 'scramble') {
        setScrambleChars(prev => prev.map((ch, i) => {
          const revealAt = i * 3
          return tick >= revealAt ? text[i] : CHARS[Math.floor(Math.random() * CHARS.length)]
        }))
      }
    }, interval)

    return () => clearInterval(intervalRef.current)
  }, [playing, speed, effect, text, tick])

  const getLetterStyle = (char, index) => {
    const base = {
      display: 'inline-block',
      fontFamily: "'Courier New', monospace",
      fontSize: 'clamp(1.5rem, 4vw, 3rem)',
      fontWeight: 700,
      transition: 'all 0.3s ease',
      whiteSpace: char === ' ' ? 'pre' : 'normal',
      minWidth: char === ' ' ? '0.5em' : undefined,
    }

    const t = tick
    const gradientColor = `color-mix(in srgb, ${color1} ${100 - (index / Math.max(text.length - 1, 1)) * 100}%, ${color2})`

    switch (effect) {
      case 'typewriter':
        return {
          ...base,
          color: index < typedCount ? color1 : 'transparent',
          borderRight: index === typedCount - 1 && playing ? `2px solid ${color1}` : 'none',
        }

      case 'wave':
        return {
          ...base,
          color: gradientColor,
          transform: `translateY(${Math.sin((t * 0.15) + index * 0.5) * 15}px)`,
          textShadow: `0 0 10px ${color1}44`,
        }

      case 'bounce': {
        const delay = index * 2
        const active = t > delay
        const bounceY = active ? Math.abs(Math.sin((t - delay) * 0.3)) * -20 * Math.max(0, 1 - (t - delay) * 0.05) : 20
        return {
          ...base,
          color: active ? gradientColor : 'transparent',
          transform: `translateY(${active ? bounceY : 30}px) scale(${active ? 1 : 0.5})`,
          opacity: active ? 1 : 0,
        }
      }

      case 'fadeIn': {
        const delay = index * 2
        const active = t > delay
        return {
          ...base,
          color: gradientColor,
          opacity: active ? 1 : 0,
          transform: `translateY(${active ? 0 : 20}px)`,
          filter: active ? 'blur(0)' : 'blur(4px)',
        }
      }

      case 'rainbow': {
        const hue = ((t * 3) + index * 30) % 360
        return {
          ...base,
          color: `hsl(${hue}, 80%, 60%)`,
          textShadow: `0 0 15px hsl(${hue}, 80%, 60%), 0 0 30px hsl(${hue}, 80%, 40%)`,
          transform: `scale(${1 + Math.sin(t * 0.1 + index) * 0.1})`,
        }
      }

      case 'scramble':
        return {
          ...base,
          color: scrambleChars[index] === text[index] ? color1 : color2,
          opacity: 0.6 + (scrambleChars[index] === text[index] ? 0.4 : Math.random() * 0.4),
        }

      case 'elastic': {
        const delay = index * 2
        const active = t > delay
        const progress = Math.min(1, (t - delay) * 0.1)
        const elastic = active ? 1 + Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.4 : 0
        return {
          ...base,
          color: gradientColor,
          transform: `scale(${elastic}) rotate(${active ? 0 : 90}deg)`,
          opacity: active ? 1 : 0,
        }
      }

      case 'karaoke': {
        const progress = t / (text.length * 2)
        const charProgress = index / text.length
        const lit = charProgress < progress
        return {
          ...base,
          color: lit ? color1 : 'rgba(255,255,255,0.2)',
          textShadow: lit ? `0 0 20px ${color1}, 0 0 40px ${color1}88` : 'none',
          transform: `scale(${lit ? 1.05 : 1})`,
        }
      }

      default:
        return { ...base, color: color1 }
    }
  }

  const displayText = effect === 'scramble' ? scrambleChars : text.split('')
  const isLooping = ['wave', 'rainbow'].includes(effect)

  // Auto-loop wave and rainbow
  useEffect(() => {
    if (!isLooping || !playing) return
    // These effects loop forever, so just keep ticking
  }, [isLooping, playing])

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div
        ref={displayRef}
        className="w-full min-h-[140px] rounded-xl border border-gray-700 bg-gray-900/80 flex items-center justify-center p-6 overflow-hidden"
      >
        <div className="flex flex-wrap justify-center">
          {(effect === 'typewriter' ? text.split('') : displayText).map((char, i) => (
            <span key={`${i}-${effect}-${tick > 0}`} style={getLetterStyle(char, i)}>
              {effect === 'scramble' ? (scrambleChars[i] || char) : char}
            </span>
          ))}
        </div>
      </div>

      {/* Text input */}
      <input
        type="text"
        value={text}
        onChange={e => { setText(e.target.value); resetAnimation() }}
        maxLength={30}
        placeholder="Type your text..."
        className="w-full bg-gray-900 text-white text-base font-mono px-4 py-3 rounded-xl border border-gray-700 focus:border-cyan-500 focus:outline-none transition-colors"
      />

      {/* Effect selector */}
      <div className="flex flex-wrap gap-2">
        {EFFECTS.map(e => (
          <button
            key={e.id}
            onClick={() => { setEffect(e.id); resetAnimation() }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              effect === e.id
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Speed</span>
            <span className="text-xs text-purple-400 font-mono">{speed}%</span>
          </div>
          <input type="range" min="10" max="100" value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Color 1</label>
            <input type="color" value={color1} onChange={e => setColor1(e.target.value)}
              className="w-full h-9 rounded cursor-pointer bg-transparent border border-gray-700" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Color 2</label>
            <input type="color" value={color2} onChange={e => setColor2(e.target.value)}
              className="w-full h-9 rounded cursor-pointer bg-transparent border border-gray-700" />
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={startAnimation}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:opacity-90 transition-opacity shadow-lg shadow-purple-600/20"
          >
            {playing ? 'Restart' : 'Play Animation'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TextAnimator
