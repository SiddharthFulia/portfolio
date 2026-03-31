import { useEffect, useRef, useState } from 'react'

const G = 500
const MAX_BODIES = 12

const randColor = () => `hsl(${Math.random() * 360},80%,60%)`

const GravitySimulator = () => {
  const canvasRef = useRef()
  const stateRef = useRef({ bodies: [], trails: [] })
  const animRef = useRef()
  const [bodyCount, setBodyCount] = useState(0)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    // Seed with a few bodies
    const { bodies, trails } = stateRef.current
    const W = () => canvas.width, H = () => canvas.height
    const spawnBody = (x, y, mass) => {
      if (bodies.length >= MAX_BODIES) return
      bodies.push({ x, y, vx: (Math.random()-0.5)*60, vy: (Math.random()-0.5)*60, mass: mass || Math.random()*30+10, color: randColor() })
      trails.push([])
      setBodyCount(bodies.length)
    }

    // Initial 4 bodies
    setTimeout(() => {
      spawnBody(canvas.width*0.3, canvas.height*0.4, 40)
      spawnBody(canvas.width*0.7, canvas.height*0.6, 35)
      spawnBody(canvas.width*0.5, canvas.height*0.25, 20)
      spawnBody(canvas.width*0.4, canvas.height*0.7, 25)
    }, 100)

    const spawnFromEvent = e => {
      const rect = canvas.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      spawnBody(src.clientX - rect.left, src.clientY - rect.top)
    }
    canvas.addEventListener('click', spawnFromEvent)
    canvas.addEventListener('touchend', e => { e.preventDefault(); spawnFromEvent(e.changedTouches ? { ...e, touches: e.changedTouches } : e) }, { passive: false })

    let last = performance.now()
    const draw = now => {
      animRef.current = requestAnimationFrame(draw)
      const dt = Math.min((now - last) / 1000, 0.03)
      last = now

      if (!pausedRef.current) {
        // Gravity + collision
        for (let i = 0; i < bodies.length; i++) {
          let fx = 0, fy = 0
          for (let j = 0; j < bodies.length; j++) {
            if (i === j) continue
            const dx = bodies[j].x - bodies[i].x
            const dy = bodies[j].y - bodies[i].y
            const dist = Math.sqrt(dx*dx + dy*dy)
            if (dist < 5) continue
            const force = G * bodies[i].mass * bodies[j].mass / (dist * dist)
            fx += force * dx / dist
            fy += force * dy / dist
          }
          bodies[i].vx += (fx / bodies[i].mass) * dt
          bodies[i].vy += (fy / bodies[i].mass) * dt
        }

        for (let i = 0; i < bodies.length; i++) {
          bodies[i].x += bodies[i].vx * dt
          bodies[i].y += bodies[i].vy * dt
          // Bounce off walls
          if (bodies[i].x < 0 || bodies[i].x > canvas.width) bodies[i].vx *= -0.8
          if (bodies[i].y < 0 || bodies[i].y > canvas.height) bodies[i].vy *= -0.8
          bodies[i].x = Math.max(0, Math.min(canvas.width, bodies[i].x))
          bodies[i].y = Math.max(0, Math.min(canvas.height, bodies[i].y))

          // Trail
          trails[i].push({ x: bodies[i].x, y: bodies[i].y })
          if (trails[i].length > 120) trails[i].shift()
        }
      }

      // Render
      ctx.fillStyle = 'rgba(3,7,18,0.25)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Trails
      for (let i = 0; i < bodies.length; i++) {
        const trail = trails[i]
        if (trail.length < 2) continue
        for (let t = 1; t < trail.length; t++) {
          const alpha = t / trail.length * 0.5
          ctx.strokeStyle = bodies[i].color.replace('60%)', `${Math.floor(alpha * 100)}%)`)
          ctx.lineWidth = Math.max(0.5, (t / trail.length) * 2)
          ctx.beginPath()
          ctx.moveTo(trail[t-1].x, trail[t-1].y)
          ctx.lineTo(trail[t].x, trail[t].y)
          ctx.stroke()
        }
      }

      // Bodies
      for (const body of bodies) {
        const r = Math.sqrt(body.mass) * 1.5
        // glow
        const grd = ctx.createRadialGradient(body.x, body.y, 0, body.x, body.y, r * 2.5)
        grd.addColorStop(0, body.color)
        grd.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(body.x, body.y, r * 2.5, 0, Math.PI*2)
        ctx.fillStyle = grd; ctx.fill()
        // body
        ctx.beginPath(); ctx.arc(body.x, body.y, r, 0, Math.PI*2)
        ctx.fillStyle = body.color; ctx.fill()
      }

      // Gravity field lines (subtle)
      if (bodies.length > 0) {
        for (let gx = 0; gx < canvas.width; gx += 60) {
          for (let gy = 0; gy < canvas.height; gy += 60) {
            let fx = 0, fy = 0
            for (const b of bodies) {
              const dx = b.x - gx, dy = b.y - gy
              const d = Math.sqrt(dx*dx + dy*dy)
              if (d < 10) continue
              const f = b.mass / (d * d) * 3000
              fx += f * dx/d; fy += f * dy/d
            }
            const len = Math.sqrt(fx*fx + fy*fy)
            if (len < 0.1) continue
            const scale = Math.min(20, len) / len
            ctx.strokeStyle = `rgba(100,180,255,0.08)`
            ctx.lineWidth = 0.5
            ctx.beginPath(); ctx.moveTo(gx, gy)
            ctx.lineTo(gx + fx*scale, gy + fy*scale)
            ctx.stroke()
          }
        }
      }
    }
    requestAnimationFrame(draw)

    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  const togglePause = () => {
    setPaused(p => { pausedRef.current = !p; return !p })
  }

  const reset = () => {
    stateRef.current.bodies.length = 0
    stateRef.current.trails.length = 0
    setBodyCount(0)
  }

  return (
    <div className='bg-gray-900 rounded-xl overflow-hidden'>
      <div className='flex flex-wrap gap-3 p-4 items-center border-b border-gray-800'>
        <button onClick={togglePause}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all
            ${paused ? 'bg-cyan-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button onClick={reset} className='px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600'>
          Reset
        </button>
        <span className='text-gray-400 text-sm'>Bodies: <strong className='text-cyan-400'>{bodyCount}</strong> / {MAX_BODIES}</span>
        <span className='text-gray-600 text-xs ml-auto'>Click anywhere to spawn a body · Gravity pulls all bodies together</span>
      </div>
      <canvas ref={canvasRef} className='w-full cursor-crosshair' style={{ height: '480px', background: '#03070c' }} />
      <div className='px-4 py-2 text-xs text-gray-600 border-t border-gray-800'>
        N-body gravity simulation · F = G·m₁·m₂/r² · Subtle field vectors shown · Trails show orbital history
      </div>
    </div>
  )
}

export default GravitySimulator
