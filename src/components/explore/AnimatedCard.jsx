import { useRef, useState, useCallback } from 'react'

/**
 * Animated 3D Card with tilt, glow, and type-based effects.
 *
 * Props:
 * - children: card content
 * - glowColor: hex color for the glow effect (default: cyan)
 * - borderColor: border color on hover
 * - tiltAmount: max tilt degrees (default: 8)
 * - onClick: click handler
 * - className: extra classes
 * - effect: 'fire' | 'water' | 'electric' | 'poison' | 'grass' | 'psychic' | 'ice' | 'dark' | 'ghost' | 'dragon' | none
 */

const EFFECT_STYLES = {
  fire: {
    glow: '#f97316',
    border: 'rgba(249,115,22,0.4)',
    bg: 'radial-gradient(ellipse at 50% 100%, rgba(249,115,22,0.15) 0%, transparent 70%)',
    shadow: '0 0 20px rgba(249,115,22,0.3)',
  },
  water: {
    glow: '#3b82f6',
    border: 'rgba(59,130,246,0.4)',
    bg: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 70%)',
    shadow: '0 0 20px rgba(59,130,246,0.3)',
  },
  electric: {
    glow: '#facc15',
    border: 'rgba(250,204,21,0.5)',
    bg: 'radial-gradient(ellipse at 50% 50%, rgba(250,204,21,0.12) 0%, transparent 60%)',
    shadow: '0 0 25px rgba(250,204,21,0.4)',
  },
  grass: {
    glow: '#22c55e',
    border: 'rgba(34,197,94,0.4)',
    bg: 'radial-gradient(ellipse at 50% 100%, rgba(34,197,94,0.12) 0%, transparent 70%)',
    shadow: '0 0 18px rgba(34,197,94,0.3)',
  },
  poison: {
    glow: '#a855f7',
    border: 'rgba(168,85,247,0.4)',
    bg: 'radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.12) 0%, transparent 60%)',
    shadow: '0 0 20px rgba(168,85,247,0.3)',
  },
  psychic: {
    glow: '#ec4899',
    border: 'rgba(236,72,153,0.4)',
    bg: 'radial-gradient(ellipse at 50% 30%, rgba(236,72,153,0.15) 0%, transparent 60%)',
    shadow: '0 0 22px rgba(236,72,153,0.35)',
  },
  ice: {
    glow: '#67e8f9',
    border: 'rgba(103,232,249,0.4)',
    bg: 'radial-gradient(ellipse at 50% 0%, rgba(103,232,249,0.15) 0%, transparent 60%)',
    shadow: '0 0 20px rgba(103,232,249,0.3)',
  },
  dragon: {
    glow: '#6366f1',
    border: 'rgba(99,102,241,0.5)',
    bg: 'radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.15) 0%, transparent 60%)',
    shadow: '0 0 25px rgba(99,102,241,0.4)',
  },
  ghost: {
    glow: '#7c3aed',
    border: 'rgba(124,58,237,0.4)',
    bg: 'radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.12) 0%, transparent 60%)',
    shadow: '0 0 20px rgba(124,58,237,0.3)',
  },
  dark: {
    glow: '#64748b',
    border: 'rgba(100,116,139,0.4)',
    bg: 'radial-gradient(ellipse at 50% 50%, rgba(100,116,139,0.1) 0%, transparent 60%)',
    shadow: '0 0 15px rgba(100,116,139,0.2)',
  },
  default: {
    glow: '#22d3ee',
    border: 'rgba(34,211,238,0.3)',
    bg: 'none',
    shadow: '0 0 15px rgba(34,211,238,0.2)',
  },
}

const isTouchDevice = () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

const AnimatedCard = ({ children, glowColor, effect, tiltAmount = 8, onClick, className = '' }) => {
  const cardRef = useRef(null)
  const [hover, setHover] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 })
  const isTouch = isTouchDevice()

  const style = EFFECT_STYLES[effect] || EFFECT_STYLES.default
  const glow = glowColor || style.glow

  const handleMouseMove = useCallback((e) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setTilt({
      x: (y - 0.5) * -tiltAmount,
      y: (x - 0.5) * tiltAmount,
    })
    setGlarePos({ x: x * 100, y: y * 100 })
  }, [tiltAmount])

  const handleMouseLeave = useCallback(() => {
    setHover(false)
    setTilt({ x: 0, y: 0 })
    setGlarePos({ x: 50, y: 50 })
  }, [])

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden cursor-pointer ${className}`}
      onClick={onClick}
      onMouseEnter={() => !isTouch && setHover(true)}
      onMouseMove={!isTouch ? handleMouseMove : undefined}
      onMouseLeave={!isTouch ? handleMouseLeave : undefined}
      style={{
        transform: hover && !isTouch
          ? `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.02)`
          : 'scale(1)',
        transition: hover ? 'transform 0.1s ease-out' : 'transform 0.4s ease-out',
        borderRadius: 12,
        border: `1px solid ${hover ? style.border : '#1f2937'}`,
        background: '#111827',
        boxShadow: hover ? style.shadow : 'none',
      }}
    >
      {/* Effect background glow */}
      {hover && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: style.bg,
          opacity: 0.8,
          transition: 'opacity 0.3s ease',
        }} />
      )}

      {/* Mouse-following glare */}
      {hover && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, ${glow}15 0%, transparent 50%)`,
        }} />
      )}

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </div>
  )
}

export default AnimatedCard
