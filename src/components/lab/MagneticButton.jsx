import { useEffect, useRef, useState, useCallback } from 'react'

const MAGNETIC_RADIUS = 120
const MAGNETIC_STRENGTH = 0.35
const RETURN_SPEED = 0.12

const MagneticButton = () => {
  const btnRef = useRef()
  const wrapRef = useRef()
  const state = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, raf: null, hovering: false })
  const [ripples, setRipples] = useState([])
  const [hover, setHover] = useState(false)
  const [gradAngle, setGradAngle] = useState(0)

  // Rotating gradient border animation
  useEffect(() => {
    let raf
    let angle = 0
    const spin = () => {
      angle = (angle + 0.8) % 360
      setGradAngle(angle)
      raf = requestAnimationFrame(spin)
    }
    raf = requestAnimationFrame(spin)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Magnetic follow + smooth return
  useEffect(() => {
    const wrap = wrapRef.current
    const btn = btnRef.current
    if (!wrap || !btn) return
    const s = state.current

    const animate = () => {
      s.x += (s.targetX - s.x) * RETURN_SPEED
      s.y += (s.targetY - s.y) * RETURN_SPEED
      if (Math.abs(s.x) > 0.1 || Math.abs(s.y) > 0.1 || Math.abs(s.targetX) > 0.1) {
        btn.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.hovering ? 1.05 : 1})`
      } else {
        btn.style.transform = `translate(0px, 0px) scale(1)`
      }
      s.raf = requestAnimationFrame(animate)
    }
    s.raf = requestAnimationFrame(animate)

    const onMove = (e) => {
      const rect = wrap.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < MAGNETIC_RADIUS) {
        s.hovering = true
        setHover(true)
        const pull = (1 - dist / MAGNETIC_RADIUS) * MAGNETIC_STRENGTH
        s.targetX = dx * pull
        s.targetY = dy * pull
      } else {
        s.hovering = false
        setHover(false)
        s.targetX = 0
        s.targetY = 0
      }
    }

    const onLeave = () => {
      s.hovering = false
      setHover(false)
      s.targetX = 0
      s.targetY = 0
    }

    document.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)

    return () => {
      cancelAnimationFrame(s.raf)
      document.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const handleClick = useCallback((e) => {
    const rect = btnRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const id = Date.now()
    setRipples(prev => [...prev, { id, x, y }])
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 700)
  }, [])

  const borderGrad = `conic-gradient(from ${gradAngle}deg, #0ff, #ff32a0, #a855f7, #0ff)`

  return (
    <div
      style={{
        width: '100%',
        minHeight: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Interaction area (larger than button for magnetic effect) */}
      <div
        ref={wrapRef}
        style={{
          width: MAGNETIC_RADIUS * 2 + 120,
          height: MAGNETIC_RADIUS * 2 + 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Glow aura behind button */}
        <div style={{
          position: 'absolute',
          width: 200,
          height: 70,
          borderRadius: 40,
          background: hover
            ? 'radial-gradient(ellipse, rgba(0,255,255,0.25) 0%, rgba(168,85,247,0.15) 40%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(0,255,255,0.06) 0%, transparent 60%)',
          filter: hover ? 'blur(20px)' : 'blur(12px)',
          transition: 'all 0.4s ease',
          pointerEvents: 'none',
          zIndex: 0,
          transform: `translate(${state.current.x * 0.5}px, ${state.current.y * 0.5}px)`,
        }} />

        {/* Gradient border wrapper */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            borderRadius: 50,
            padding: hover ? 2 : 1,
            background: hover ? borderGrad : 'rgba(255,255,255,0.15)',
            transition: hover ? 'none' : 'background 0.4s, padding 0.3s',
          }}
        >
          {/* The actual button */}
          <button
            ref={btnRef}
            onClick={handleClick}
            style={{
              position: 'relative',
              overflow: 'hidden',
              border: 'none',
              borderRadius: 48,
              padding: '16px 44px',
              fontSize: '1.1rem',
              fontWeight: 600,
              letterSpacing: 1.5,
              color: '#fff',
              background: 'linear-gradient(135deg, rgba(10,10,20,0.95), rgba(20,15,40,0.95))',
              cursor: 'pointer',
              willChange: 'transform',
              transition: 'box-shadow 0.3s ease',
              boxShadow: hover
                ? '0 0 30px rgba(0,255,255,0.15), 0 0 60px rgba(168,85,247,0.1), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
              textTransform: 'uppercase',
            }}
          >
            {/* Button text */}
            <span style={{
              position: 'relative',
              zIndex: 2,
              color: hover ? '#0ff' : '#fff',
              transition: 'color 0.3s',
              textShadow: hover ? '0 0 20px rgba(0,255,255,0.5)' : 'none',
            }}>
              Get in Touch
            </span>

            {/* Inner hover shine */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 48,
              opacity: hover ? 1 : 0,
              background: 'linear-gradient(105deg, transparent 40%, rgba(0,255,255,0.04) 45%, rgba(168,85,247,0.04) 55%, transparent 60%)',
              transition: 'opacity 0.4s',
              pointerEvents: 'none',
              zIndex: 1,
            }} />

            {/* Ripples */}
            {ripples.map(r => (
              <span
                key={r.id}
                style={{
                  position: 'absolute',
                  left: r.x,
                  top: r.y,
                  width: 0,
                  height: 0,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(0,255,255,0.4), rgba(168,85,247,0.2), transparent)',
                  transform: 'translate(-50%, -50%)',
                  animation: 'magneticRipple 0.7s ease-out forwards',
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              />
            ))}
          </button>
        </div>

        {/* Floating particles around button when hovered */}
        {hover && (
          <>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{
                position: 'absolute',
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: i % 2 === 0 ? '#0ff' : '#ff32a0',
                opacity: 0.6,
                animation: `magneticParticle${i % 3} ${1.5 + i * 0.3}s ease-in-out infinite`,
                pointerEvents: 'none',
                zIndex: 0,
              }} />
            ))}
          </>
        )}
      </div>

      <style>{`
        @keyframes magneticRipple {
          0% { width: 0; height: 0; opacity: 0.6; }
          100% { width: 300px; height: 300px; opacity: 0; }
        }

        @keyframes magneticTextShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes magneticParticle0 {
          0%, 100% { transform: translate(-60px, -30px) scale(1); opacity: 0; }
          50% { transform: translate(-40px, -20px) scale(1.5); opacity: 0.7; }
        }
        @keyframes magneticParticle1 {
          0%, 100% { transform: translate(60px, -25px) scale(1); opacity: 0; }
          50% { transform: translate(45px, -15px) scale(1.8); opacity: 0.6; }
        }
        @keyframes magneticParticle2 {
          0%, 100% { transform: translate(0px, 40px) scale(1); opacity: 0; }
          50% { transform: translate(10px, 25px) scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default MagneticButton
