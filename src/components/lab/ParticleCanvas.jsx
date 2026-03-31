import { useEffect, useRef } from 'react'

const ParticleCanvas = () => {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId
    const mouse = { x: -9999, y: -9999 }

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const N = 140
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      r: Math.random() * 2 + 1,
      hue: Math.random() * 60 + 180, // cyan–purple range
    }))

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    })
    canvas.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999 })

    const draw = () => {
      ctx.fillStyle = 'rgba(3,7,18,0.18)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120 && dist > 0) {
          p.vx += (dx / dist) * (1 - dist / 120) * 1.2
          p.vy += (dy / dist) * (1 - dist / 120) * 1.2
        }
        p.vx *= 0.97
        p.vy *= 0.97
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) { p.x = 0; p.vx *= -1 }
        if (p.x > canvas.width) { p.x = canvas.width; p.vx *= -1 }
        if (p.y < 0) { p.y = 0; p.vy *= -1 }
        if (p.y > canvas.height) { p.y = canvas.height; p.vy *= -1 }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`
        ctx.fill()
      }

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 130) {
            const alpha = 1 - d / 130
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(100,210,255,${alpha * 0.6})`
            ctx.lineWidth = alpha * 1.2
            ctx.stroke()
          }
        }
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className='relative rounded-xl overflow-hidden' style={{ height: '500px' }}>
      <div className='absolute top-4 left-4 z-10 text-gray-400 text-xs bg-gray-950/60 px-3 py-1.5 rounded-full backdrop-blur'>
        Move cursor to repel particles
      </div>
      <canvas ref={canvasRef} className='w-full h-full bg-gray-950' />
    </div>
  )
}

export default ParticleCanvas
