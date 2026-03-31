import { useEffect, useRef } from 'react'

const FONT = 14
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const MatrixRain = () => {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId, drops = []

    const init = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const cols = Math.floor(canvas.width / FONT)
      drops = Array(cols).fill(0).map(() => Math.random() * -50)
    }
    init()

    const observer = new ResizeObserver(init)
    observer.observe(canvas)

    let last = 0
    const draw = ts => {
      animId = requestAnimationFrame(draw)
      if (ts - last < 45) return
      last = ts

      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.font = `${FONT}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)]
        const y = drops[i] * FONT
        // bright leading char
        ctx.fillStyle = '#fff'
        ctx.fillText(char, i * FONT, y)
        // trail
        ctx.fillStyle = '#00ff41'
        ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * FONT, y - FONT)

        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i] += 1
      }
    }
    requestAnimationFrame(draw)

    return () => { cancelAnimationFrame(animId); observer.disconnect() }
  }, [])

  return (
    <div className='relative rounded-xl overflow-hidden bg-black' style={{ height: '500px' }}>
      <canvas ref={canvasRef} className='w-full h-full' />
      <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
        <div className='text-center px-10 py-6 bg-black/50 rounded-2xl backdrop-blur-sm border border-green-900/50'>
          <p className='text-green-400 font-mono text-xl font-bold tracking-widest'>Wake up, Neo…</p>
          <p className='text-green-700 font-mono text-sm mt-1'>The Matrix has you.</p>
        </div>
      </div>
    </div>
  )
}

export default MatrixRain
