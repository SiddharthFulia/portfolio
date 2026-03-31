import { useEffect, useState, useRef } from 'react'

const TEXT = 'Creative Developer'
const SUBTITLE = '& Designer'
const TOTAL = TEXT.length + SUBTITLE.length

const BRICK_CSS = `
  repeating-linear-gradient(
    90deg,
    transparent 0px,
    transparent 47px,
    rgba(30,20,15,0.8) 47px,
    rgba(30,20,15,0.8) 50px
  ),
  repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 23px,
    rgba(30,20,15,0.8) 23px,
    rgba(30,20,15,0.8) 25px
  ),
  repeating-linear-gradient(
    90deg,
    transparent 0px,
    transparent 22px,
    rgba(30,20,15,0.8) 22px,
    rgba(30,20,15,0.8) 25px
  )
`

const NeonText = () => {
  const [visibleCount, setVisibleCount] = useState(0)
  const [flickerIdx, setFlickerIdx] = useState(-1)
  const containerRef = useRef()

  // Letter-by-letter turn on (main text + subtitle)
  useEffect(() => {
    if (visibleCount >= TOTAL) return
    const t = setTimeout(() => setVisibleCount(c => c + 1), 80 + Math.random() * 60)
    return () => clearTimeout(t)
  }, [visibleCount])

  // Random flicker effect
  useEffect(() => {
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * TEXT.length)
      if (TEXT[idx] === ' ') return
      setFlickerIdx(idx)
      setTimeout(() => setFlickerIdx(-1), 80 + Math.random() * 120)
    }, 2500 + Math.random() * 3000)
    return () => clearInterval(interval)
  }, [])

  const cyanGlow = (on, flicker) => {
    if (!on) return 'transparent'
    if (flicker) return 'rgba(0,255,255,0.15)'
    return 'currentColor'
  }

  const cyanShadow = (on, flicker) => {
    if (!on) return 'none'
    if (flicker)
      return '0 0 2px rgba(0,255,255,0.2)'
    return `
      0 0 7px #0ff,
      0 0 10px #0ff,
      0 0 21px #0ff,
      0 0 42px #0bc,
      0 0 82px #0bc,
      0 0 92px #0bc
    `
  }

  const pinkShadow = (on, flicker) => {
    if (!on) return 'none'
    if (flicker)
      return '0 0 2px rgba(255,50,150,0.2)'
    return `
      0 0 7px #ff32a0,
      0 0 10px #ff32a0,
      0 0 21px #ff32a0,
      0 0 42px #c0267a,
      0 0 82px #c0267a
    `
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: 340,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        backgroundImage: BRICK_CSS,
        backgroundColor: '#1a1210',
        backgroundSize: '50px 25px, 50px 25px, 25px 50px',
        backgroundPosition: '0 0, 25px 25px, 0 0',
      }}
    >
      {/* Main neon line - cyan */}
      <div style={{
        display: 'flex',
        fontFamily: "'Pacifico', 'Segoe Script', cursive",
        fontSize: 'clamp(2rem, 5vw, 3.8rem)',
        fontWeight: 400,
        letterSpacing: 2,
        position: 'relative',
        zIndex: 2,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '0 1rem',
      }}>
        {TEXT.split('').map((ch, i) => {
          const on = i < visibleCount
          const flicker = i === flickerIdx
          return (
            <span
              key={i}
              style={{
                color: cyanGlow(on, flicker),
                textShadow: cyanShadow(on, flicker),
                transition: flicker ? 'none' : 'color 0.3s, text-shadow 0.4s',
                whiteSpace: ch === ' ' ? 'pre' : 'normal',
              }}
            >
              {ch}
            </span>
          )
        })}
      </div>

      {/* Subtitle line - pink neon */}
      <div style={{
        display: 'flex',
        fontFamily: "'Pacifico', 'Segoe Script', cursive",
        fontSize: 'clamp(1rem, 2.5vw, 1.6rem)',
        fontWeight: 400,
        letterSpacing: 4,
        marginTop: 12,
        position: 'relative',
        zIndex: 2,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '0 1rem',
      }}>
        {SUBTITLE.split('').map((ch, i) => {
          const on = visibleCount > TEXT.length + i
          return (
            <span
              key={i}
              style={{
                color: on ? '#ff32a0' : 'transparent',
                textShadow: pinkShadow(on, false),
                transition: 'color 0.3s, text-shadow 0.4s',
                whiteSpace: ch === ' ' ? 'pre' : 'normal',
              }}
            >
              {ch}
            </span>
          )
        })}
      </div>

      {/* Reflection */}
      <div style={{
        display: 'flex',
        fontFamily: "'Pacifico', 'Segoe Script', cursive",
        fontSize: 'clamp(2rem, 5vw, 3.8rem)',
        fontWeight: 400,
        letterSpacing: 2,
        position: 'relative',
        zIndex: 1,
        transform: 'scaleY(-1)',
        marginTop: 4,
        opacity: 0.12,
        filter: 'blur(3px)',
        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 80%)',
        WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 80%)',
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '0 1rem',
      }}>
        {TEXT.split('').map((ch, i) => {
          const on = i < visibleCount
          return (
            <span
              key={i}
              style={{
                color: on ? '#0ff' : 'transparent',
                textShadow: on ? '0 0 10px #0ff, 0 0 20px #0ff' : 'none',
                transition: 'color 0.3s, text-shadow 0.4s',
                whiteSpace: ch === ' ' ? 'pre' : 'normal',
              }}
            >
              {ch}
            </span>
          )
        })}
      </div>

      {/* Ambient glow on wall */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '70%',
        height: '50%',
        background: visibleCount > 5
          ? 'radial-gradient(ellipse, rgba(0,255,255,0.06) 0%, rgba(255,50,150,0.03) 40%, transparent 70%)'
          : 'none',
        transition: 'background 1s',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Tube mounting brackets */}
      {[0, TEXT.length - 1].map(i => (
        <div key={i} style={{
          position: 'absolute',
          top: 'calc(50% - 50px)',
          left: i === 0 ? '12%' : '82%',
          width: 6,
          height: 18,
          background: 'linear-gradient(180deg, #444, #222)',
          borderRadius: 2,
          zIndex: 3,
          boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
        }} />
      ))}

      {/* Google Fonts link for Pacifico */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pacifico&display=swap');
      `}</style>
    </div>
  )
}

export default NeonText
