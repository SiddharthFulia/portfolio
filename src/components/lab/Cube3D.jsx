import { useEffect, useRef, useState, useCallback } from 'react'

const FACES = [
  { label: 'React',    gradient: 'linear-gradient(135deg, #0d9488, #06b6d4)', glow: '#06b6d4' },
  { label: 'Node.js',  gradient: 'linear-gradient(135deg, #16a34a, #4ade80)', glow: '#4ade80' },
  { label: 'Python',   gradient: 'linear-gradient(135deg, #ca8a04, #facc15)', glow: '#facc15' },
  { label: 'MongoDB',  gradient: 'linear-gradient(135deg, #15803d, #22c55e)', glow: '#22c55e' },
  { label: 'Next.js',  gradient: 'linear-gradient(135deg, #6366f1, #a78bfa)', glow: '#a78bfa' },
  { label: 'Docker',   gradient: 'linear-gradient(135deg, #0369a1, #38bdf8)', glow: '#38bdf8' },
]

// Transform for each face of the cube (front, back, right, left, top, bottom)
const FACE_TRANSFORMS = [
  'rotateY(0deg)   translateZ(100px)',
  'rotateY(180deg) translateZ(100px)',
  'rotateY(90deg)  translateZ(100px)',
  'rotateY(-90deg) translateZ(100px)',
  'rotateX(90deg)  translateZ(100px)',
  'rotateX(-90deg) translateZ(100px)',
]

const Cube3D = () => {
  const cubeRef = useRef(null)
  const rafRef = useRef(null)
  const rotationRef = useRef({ x: -25, y: 45 })
  const velocityRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const autoRotateRef = useRef(true)
  const resumeTimerRef = useRef(null)

  const [isDragging, setIsDragging] = useState(false)

  // Animation loop
  useEffect(() => {
    let lastTime = performance.now()

    const animate = (now) => {
      const dt = Math.min((now - lastTime) / 16.67, 3) // normalize to ~60fps, cap
      lastTime = now

      if (!draggingRef.current) {
        // Apply inertia decay
        velocityRef.current.x *= 0.95
        velocityRef.current.y *= 0.95

        // If velocity is negligible and auto-rotate is on, do slow auto-rotation
        const speed = Math.abs(velocityRef.current.x) + Math.abs(velocityRef.current.y)
        if (speed < 0.05 && autoRotateRef.current) {
          velocityRef.current.x = 0
          velocityRef.current.y = 0
          rotationRef.current.x += -0.15 * dt
          rotationRef.current.y += 0.3 * dt
        } else {
          rotationRef.current.x += velocityRef.current.x * dt
          rotationRef.current.y += velocityRef.current.y * dt
        }
      }

      if (cubeRef.current) {
        cubeRef.current.style.transform =
          `rotateX(${rotationRef.current.x}deg) rotateY(${rotationRef.current.y}deg)`
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    autoRotateRef.current = false
    clearTimeout(resumeTimerRef.current)

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    lastPointerRef.current = { x: clientX, y: clientY }
    velocityRef.current = { x: 0, y: 0 }
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!draggingRef.current) return
    e.preventDefault()

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    const dx = clientX - lastPointerRef.current.x
    const dy = clientY - lastPointerRef.current.y

    const sensitivity = 0.4
    velocityRef.current.x = -dy * sensitivity
    velocityRef.current.y = dx * sensitivity

    rotationRef.current.x += velocityRef.current.x
    rotationRef.current.y += velocityRef.current.y

    lastPointerRef.current = { x: clientX, y: clientY }
  }, [])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
    setIsDragging(false)
    // Resume auto-rotate after 3s of inactivity
    clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => {
      autoRotateRef.current = true
    }, 3000)
  }, [])

  // Attach window-level listeners for drag release outside component
  useEffect(() => {
    const onMove = (e) => handlePointerMove(e)
    const onUp = () => handlePointerUp()

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      clearTimeout(resumeTimerRef.current)
    }
  }, [handlePointerMove, handlePointerUp])

  return (
    <div style={styles.wrapper}>
      <div
        style={styles.scene}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
      >
        <div ref={cubeRef} style={styles.cube}>
          {FACES.map((face, i) => (
            <div
              key={face.label}
              style={{
                ...styles.face,
                background: face.gradient,
                transform: FACE_TRANSFORMS[i],
                boxShadow: `inset 0 0 40px rgba(0,0,0,0.3), 0 0 20px ${face.glow}44`,
              }}
            >
              <span style={styles.label}>{face.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reflection / shadow beneath the cube */}
      <div style={styles.shadow} />

      <p style={styles.hint}>
        {isDragging ? 'Drag to explore' : 'Drag the cube to interact'}
      </p>
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '420px',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  scene: {
    width: 200,
    height: 200,
    perspective: 800,
    perspectiveOrigin: '50% 50%',
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cube: {
    width: 200,
    height: 200,
    position: 'relative',
    transformStyle: 'preserve-3d',
    willChange: 'transform',
  },
  face: {
    position: 'absolute',
    width: 200,
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(2px)',
  },
  label: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
    pointerEvents: 'none',
  },
  shadow: {
    marginTop: 30,
    width: 160,
    height: 24,
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(120,180,255,0.18) 0%, transparent 70%)',
    filter: 'blur(6px)',
    animation: 'cubeShadowPulse 4s ease-in-out infinite',
  },
  hint: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    letterSpacing: '0.03em',
  },
}

// Inject keyframe animation for shadow pulse
if (typeof document !== 'undefined' && !document.getElementById('cube3d-styles')) {
  const sheet = document.createElement('style')
  sheet.id = 'cube3d-styles'
  sheet.textContent = `
    @keyframes cubeShadowPulse {
      0%, 100% { opacity: 0.7; transform: scaleX(1); }
      50%      { opacity: 1;   transform: scaleX(1.15); }
    }
  `
  document.head.appendChild(sheet)
}

export default Cube3D
