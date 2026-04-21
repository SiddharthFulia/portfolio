import { useState, useEffect, useCallback } from 'react'

// Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA']

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  delay: Math.random() * 2,
  size: 10 + Math.random() * 20,
  duration: 2 + Math.random() * 3,
  emoji: ['🚀','⭐','🎉','🔥','💫','✨','🎮','💻','🤖','🧠'][i % 10],
}))

const EasterEgg = () => {
  const [active, setActive] = useState(false)
  const [seq, setSeq] = useState([])

  const handleKey = useCallback((e) => {
    setSeq(prev => {
      const next = [...prev, e.code].slice(-10)
      if (next.length === 10 && next.every((k, i) => k === KONAMI[i])) {
        setActive(true)
        setTimeout(() => setActive(false), 5000)
        return []
      }
      return next
    })
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Particles */}
      {PARTICLES.map(p => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            bottom: '-10%',
            fontSize: p.size,
            animation: `easterRise ${p.duration}s ease-out ${p.delay}s forwards`,
          }}
        >
          {p.emoji}
        </div>
      ))}

      {/* Center message */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center" style={{ animation: 'easterPop 0.5s ease-out 0.3s both' }}>
          <div className="text-6xl mb-4">🎮</div>
          <div className="text-white text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            KONAMI CODE ACTIVATED!
          </div>
          <div className="text-gray-400 text-sm mt-2">You found the secret!</div>
        </div>
      </div>

      <style>{`
        @keyframes easterRise {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-120vh) rotate(720deg); opacity: 0; }
        }
        @keyframes easterPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default EasterEgg
