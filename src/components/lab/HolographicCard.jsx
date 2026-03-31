import { useState, useRef, useCallback } from 'react'

const STATS = [
  { label: 'React', value: 97 },
  { label: 'Node.js', value: 94 },
  { label: 'Three.js', value: 89 },
  { label: 'TypeScript', value: 92 },
  { label: 'System Design', value: 88 },
]

const HolographicCard = () => {
  const cardRef = useRef(null)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 })
  const rafRef = useRef(null)

  const handleMouseMove = useCallback((e) => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      const rect = cardRef.current?.getBoundingClientRect()
      if (!rect) { rafRef.current = null; return }
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      setPos({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) })
      rafRef.current = null
    })
  }, [])

  const handleMouseEnter = useCallback(() => setHover(true), [])
  const handleMouseLeave = useCallback(() => {
    setHover(false)
    setPos({ x: 0.5, y: 0.5 })
  }, [])

  const rotateX = hover ? (pos.y - 0.5) * -25 : 0
  const rotateY = hover ? (pos.x - 0.5) * 25 : 0

  const holoGradient = `
    linear-gradient(
      ${125 + (pos.x - 0.5) * 60}deg,
      rgba(255,0,128,0.35) 0%,
      rgba(255,140,0,0.3) 14%,
      rgba(255,255,0,0.3) 28%,
      rgba(0,255,128,0.35) 42%,
      rgba(0,200,255,0.35) 57%,
      rgba(100,100,255,0.35) 71%,
      rgba(200,0,255,0.35) 85%,
      rgba(255,0,128,0.35) 100%
    )
  `

  const glareX = pos.x * 100
  const glareY = pos.y * 100

  const sparkleGradient = `
    radial-gradient(
      circle at ${glareX}% ${glareY}%,
      rgba(255,255,255,0.5) 0%,
      rgba(255,255,255,0.15) 20%,
      transparent 60%
    )
  `

  const microShimmer = `
    repeating-linear-gradient(
      ${(pos.x * 120) + 30}deg,
      transparent 0px,
      rgba(255,255,255,0.04) 2px,
      transparent 4px
    )
  `

  const keyframesStyle = `
    @keyframes holo-float {
      0%, 100% { transform: perspective(800px) translateY(0px) rotateX(2deg) rotateY(-1deg); }
      25% { transform: perspective(800px) translateY(-8px) rotateX(-1deg) rotateY(2deg); }
      50% { transform: perspective(800px) translateY(-4px) rotateX(1deg) rotateY(-2deg); }
      75% { transform: perspective(800px) translateY(-10px) rotateX(-2deg) rotateY(1deg); }
    }
    @keyframes holo-shimmer {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes stat-fill {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }
    @keyframes pulse-glow {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
    @keyframes card-border-spin {
      0% { --angle: 0deg; }
      100% { --angle: 360deg; }
    }
  `

  const cardStyle = {
    width: 300,
    height: 420,
    borderRadius: 18,
    position: 'relative',
    transformStyle: 'preserve-3d',
    transition: hover ? 'transform 0.1s ease-out, box-shadow 0.3s ease' : 'transform 0.6s ease-out, box-shadow 0.6s ease',
    transform: hover
      ? `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`
      : undefined,
    animation: hover ? 'none' : 'holo-float 6s ease-in-out infinite',
    cursor: 'pointer',
    boxShadow: hover
      ? `0 20px 60px rgba(0,0,0,0.5),
         0 0 40px rgba(120,80,255,0.3),
         0 0 80px rgba(120,80,255,0.15),
         inset 0 0 30px rgba(255,255,255,0.05)`
      : `0 10px 40px rgba(0,0,0,0.4),
         0 0 20px rgba(120,80,255,0.15)`,
  }

  const overlayStyle = {
    position: 'absolute',
    inset: 0,
    borderRadius: 18,
    background: hover ? holoGradient : 'linear-gradient(135deg, rgba(255,0,128,0.12), rgba(0,200,255,0.12), rgba(200,0,255,0.12))',
    backgroundSize: hover ? '100% 100%' : '200% 200%',
    animation: hover ? 'none' : 'holo-shimmer 4s ease infinite',
    mixBlendMode: 'color-dodge',
    opacity: hover ? 1 : 0.6,
    transition: 'opacity 0.4s ease',
    pointerEvents: 'none',
    zIndex: 2,
  }

  const glareStyle = {
    position: 'absolute',
    inset: 0,
    borderRadius: 18,
    background: sparkleGradient,
    opacity: hover ? 1 : 0,
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none',
    zIndex: 3,
  }

  const shimmerStyle = {
    position: 'absolute',
    inset: 0,
    borderRadius: 18,
    background: microShimmer,
    opacity: hover ? 0.8 : 0,
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none',
    zIndex: 4,
  }

  const borderGlowStyle = {
    position: 'absolute',
    inset: -2,
    borderRadius: 20,
    background: `linear-gradient(${hover ? 135 + (pos.x * 90) : 135}deg, #ff0080, #7928ca, #00d4ff, #ff0080)`,
    backgroundSize: '300% 300%',
    backgroundPosition: hover ? `${pos.x * 100}% ${pos.y * 100}%` : '0% 50%',
    animation: hover ? 'none' : 'holo-shimmer 3s ease infinite',
    zIndex: -1,
    transition: 'background-position 0.15s ease',
  }

  const innerBgStyle = {
    position: 'absolute',
    inset: 2,
    borderRadius: 16,
    background: 'linear-gradient(160deg, rgba(15,15,30,0.97), rgba(8,8,20,0.99))',
    zIndex: 0,
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-950 select-none overflow-hidden">
      <style>{keyframesStyle}</style>

      <div
        ref={cardRef}
        style={cardStyle}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Animated border glow */}
        <div style={borderGlowStyle} />

        {/* Card inner background */}
        <div style={innerBgStyle} />

        {/* Holographic rainbow overlay */}
        <div style={overlayStyle} />

        {/* Mouse-following glare */}
        <div style={glareStyle} />

        {/* Micro shimmer lines */}
        <div style={shimmerStyle} />

        {/* Card content */}
        <div style={{ position: 'relative', zIndex: 5, padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Top badge row */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-[10px] font-bold tracking-[0.3em] uppercase"
              style={{ color: 'rgba(200,180,255,0.7)' }}
            >
              Legendary
            </span>
            <span
              className="text-[10px] font-mono"
              style={{ color: 'rgba(255,200,100,0.6)' }}
            >
              #001 / 001
            </span>
          </div>

          {/* Avatar area */}
          <div className="flex justify-center mb-3">
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: `conic-gradient(from ${hover ? pos.x * 360 : 0}deg, #ff0080, #7928ca, #00d4ff, #00ff88, #ff0080)`,
                padding: 2,
                transition: 'all 0.3s ease',
                animation: hover ? 'none' : 'pulse-glow 3s ease-in-out infinite',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1a1040, #0a0a20)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                <span style={{
                  background: 'linear-gradient(135deg, #ff0080, #00d4ff)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                }}>
                  SF
                </span>
              </div>
            </div>
          </div>

          {/* Name & title */}
          <div className="text-center mb-4">
            <h2
              className="text-lg font-bold tracking-wide"
              style={{
                background: 'linear-gradient(90deg, #fff, #e0d0ff, #fff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: 'none',
              }}
            >
              Siddharth Fulia
            </h2>
            <p
              className="text-xs tracking-[0.15em] mt-1 font-medium"
              style={{ color: 'rgba(0,212,255,0.7)' }}
            >
              Full Stack Engineer
            </p>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: `linear-gradient(90deg, transparent, rgba(120,80,255,${hover ? 0.5 : 0.2}), rgba(0,200,255,${hover ? 0.5 : 0.2}), transparent)`,
              marginBottom: 14,
              transition: 'all 0.4s ease',
            }}
          />

          {/* Stats */}
          <div className="flex-1 flex flex-col gap-[10px]">
            {STATS.map((stat, i) => (
              <div key={stat.label}>
                <div className="flex justify-between mb-[3px]">
                  <span
                    className="text-[10px] font-semibold tracking-wider"
                    style={{ color: 'rgba(220,210,255,0.8)' }}
                  >
                    {stat.label}
                  </span>
                  <span
                    className="text-[10px] font-mono font-bold"
                    style={{
                      background: 'linear-gradient(90deg, #ff0080, #00d4ff)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {stat.value}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${stat.value}%`,
                      borderRadius: 2,
                      background: `linear-gradient(90deg,
                        hsl(${280 + i * 30}, 100%, 65%),
                        hsl(${200 + i * 30}, 100%, 60%))`,
                      transformOrigin: 'left',
                      animation: `stat-fill 1.2s ease-out ${0.2 + i * 0.15}s both`,
                      boxShadow: hover
                        ? `0 0 8px hsl(${280 + i * 30}, 100%, 65%)`
                        : 'none',
                      transition: 'box-shadow 0.4s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid rgba(120,80,255,0.12)' }}>
            <div className="flex gap-[6px]">
              {['React', 'Node', '3D'].map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] font-bold px-[6px] py-[2px] rounded-full tracking-wider uppercase"
                  style={{
                    background: 'rgba(120,80,255,0.15)',
                    color: 'rgba(180,160,255,0.8)',
                    border: '1px solid rgba(120,80,255,0.2)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <div
              className="text-[9px] font-mono"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              2026 ED.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HolographicCard
