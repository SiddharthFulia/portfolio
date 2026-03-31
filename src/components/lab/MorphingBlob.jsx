import { useEffect, useRef, useState, useCallback } from 'react'

const ORBIT_LABELS = [
  'creative', 'design', 'motion', 'fluid', 'organic', 'vivid', 'dream', 'flow'
]

const BORDER_RADIUS_KEYFRAMES = [
  '30% 70% 70% 30% / 30% 30% 70% 70%',
  '50% 50% 30% 70% / 60% 40% 60% 40%',
  '70% 30% 50% 50% / 40% 60% 30% 70%',
  '40% 60% 60% 40% / 70% 30% 50% 50%',
  '60% 40% 30% 70% / 50% 50% 70% 30%',
  '35% 65% 45% 55% / 55% 45% 65% 35%',
]

function lerp(a, b, t) {
  return a + (b - a) * t
}

function parseBorderRadius(str) {
  const [horiz, vert] = str.split('/').map(s => s.trim())
  const h = horiz.split(' ').map(parseFloat)
  const v = vert.split(' ').map(parseFloat)
  return [...h, ...v] // 8 values
}

function interpolateBorderRadius(from, to, t) {
  const f = parseBorderRadius(from)
  const tgt = parseBorderRadius(to)
  const result = f.map((v, i) => lerp(v, tgt[i], t))
  return `${result[0]}% ${result[1]}% ${result[2]}% ${result[3]}% / ${result[4]}% ${result[5]}% ${result[6]}% ${result[7]}%`
}

const MorphingBlob = () => {
  const containerRef = useRef(null)
  const blobRef = useRef(null)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const animRef = useRef(null)
  const blobPos = useRef({ x: 0, y: 0 })
  const [labels, setLabels] = useState(() =>
    ORBIT_LABELS.map((text, i) => ({
      text,
      angle: (i / ORBIT_LABELS.length) * Math.PI * 2,
      radius: 220 + Math.random() * 40,
      speed: 0.15 + Math.random() * 0.15,
      size: 11 + Math.random() * 4,
    }))
  )

  const handleMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }, [])

  useEffect(() => {
    const blob = blobRef.current
    if (!blob) return

    let startTime = performance.now()
    let frameIdx = 0
    const morphSpeed = 0.0004 // slower = smoother transitions

    const animate = (now) => {
      const elapsed = now - startTime
      const t = elapsed * morphSpeed

      // Morph border-radius
      const totalFrames = BORDER_RADIUS_KEYFRAMES.length
      const segment = t % totalFrames
      const fromIdx = Math.floor(segment) % totalFrames
      const toIdx = (fromIdx + 1) % totalFrames
      const segT = segment - Math.floor(segment)
      // Smooth easing
      const eased = segT * segT * (3 - 2 * segT)
      const br = interpolateBorderRadius(
        BORDER_RADIUS_KEYFRAMES[fromIdx],
        BORDER_RADIUS_KEYFRAMES[toIdx],
        eased
      )
      blob.style.borderRadius = br

      // Gradient rotation
      const gradAngle = (elapsed * 0.02) % 360
      const hueShift = (elapsed * 0.01) % 360
      blob.style.background = `linear-gradient(${gradAngle}deg,
        hsl(${(185 + hueShift) % 360}, 90%, 55%),
        hsl(${(270 + hueShift) % 360}, 85%, 55%),
        hsl(${(320 + hueShift) % 360}, 80%, 55%),
        hsl(${(210 + hueShift) % 360}, 90%, 50%)
      )`

      // Mouse follow with smooth damping
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const targetX = (mx - 0.5) * 60
      const targetY = (my - 0.5) * 60
      blobPos.current.x = lerp(blobPos.current.x, targetX, 0.03)
      blobPos.current.y = lerp(blobPos.current.y, targetY, 0.03)

      // Subtle breathing scale
      const scale = 1 + Math.sin(elapsed * 0.001) * 0.05

      blob.style.transform = `translate(${blobPos.current.x}px, ${blobPos.current.y}px) scale(${scale})`

      // Update orbit labels
      setLabels(prev =>
        prev.map(l => ({
          ...l,
          angle: l.angle + l.speed * 0.016,
        }))
      )

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full h-full min-h-[500px] flex items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #030308 100%)' }}
    >
      {/* Ambient glow behind blob */}
      <div
        className="absolute rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{
          width: 420,
          height: 420,
          background: 'radial-gradient(circle, #06b6d4 0%, #a855f7 40%, #ec4899 70%, transparent 100%)',
          animation: 'pulse 4s ease-in-out infinite',
        }}
      />

      {/* The morphing blob */}
      <div
        ref={blobRef}
        className="relative z-10 pointer-events-none"
        style={{
          width: 300,
          height: 300,
          borderRadius: BORDER_RADIUS_KEYFRAMES[0],
          background: 'linear-gradient(135deg, #06b6d4, #8b5cf6, #ec4899, #3b82f6)',
          boxShadow: `
            0 0 60px rgba(6,182,212,0.4),
            0 0 120px rgba(139,92,246,0.25),
            0 0 200px rgba(236,72,153,0.15),
            inset 0 0 80px rgba(255,255,255,0.05)
          `,
          transition: 'box-shadow 0.3s ease',
          willChange: 'transform, border-radius, background',
        }}
      />

      {/* Frosted glass overlay */}
      <div
        className="absolute z-20 rounded-3xl border pointer-events-none"
        style={{
          width: 340,
          height: 340,
          backdropFilter: 'blur(8px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(8px) saturate(1.4)',
          background: 'rgba(255,255,255,0.03)',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 0 30px rgba(255,255,255,0.02)',
        }}
      />

      {/* Orbiting labels */}
      {labels.map((l, i) => {
        const x = Math.cos(l.angle) * l.radius
        const y = Math.sin(l.angle) * l.radius
        const opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(l.angle * 2))
        return (
          <span
            key={i}
            className="absolute z-30 font-mono tracking-widest uppercase select-none pointer-events-none"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              fontSize: l.size,
              color: `rgba(200, 210, 255, ${opacity})`,
              textShadow: `0 0 12px rgba(139,92,246,${opacity * 0.6})`,
              willChange: 'transform',
              letterSpacing: '0.15em',
            }}
          >
            {l.text}
          </span>
        )
      })}

      {/* Small floating particles for depth */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={`p-${i}`}
          className="absolute rounded-full pointer-events-none z-10"
          style={{
            width: 2 + Math.random() * 3,
            height: 2 + Math.random() * 3,
            background: `rgba(${150 + Math.random() * 100}, ${180 + Math.random() * 75}, 255, ${0.15 + Math.random() * 0.25})`,
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            animation: `float-particle-${i % 4} ${6 + Math.random() * 8}s ease-in-out infinite`,
            animationDelay: `${-Math.random() * 6}s`,
          }}
        />
      ))}

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.08); }
        }
        @keyframes float-particle-0 {
          0%, 100% { transform: translate(0, 0); opacity: 0.2; }
          50% { transform: translate(15px, -20px); opacity: 0.5; }
        }
        @keyframes float-particle-1 {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(-20px, 12px); opacity: 0.5; }
        }
        @keyframes float-particle-2 {
          0%, 100% { transform: translate(0, 0); opacity: 0.15; }
          50% { transform: translate(10px, 18px); opacity: 0.45; }
        }
        @keyframes float-particle-3 {
          0%, 100% { transform: translate(0, 0); opacity: 0.25; }
          50% { transform: translate(-12px, -15px); opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}

export default MorphingBlob
