import { useEffect, useRef, useState } from 'react'

const WarpSpeed = () => {
  const canvasRef = useRef()
  const speedRef = useRef(4)
  const [warping, setWarping] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId

    const init = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    init()
    window.addEventListener('resize', init)

    const N = 1000
    const stars = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * 2000,
      pz: 0,
    }))

    const draw = () => {
      animId = requestAnimationFrame(draw)
      const W = canvas.width, H = canvas.height
      const spd = speedRef.current

      ctx.fillStyle = '#000010'
      ctx.fillRect(0, 0, W, H)

      for (const s of stars) {
        s.pz = s.z
        s.z -= spd
        if (s.z <= 0) {
          s.x = (Math.random() - 0.5) * 2000
          s.y = (Math.random() - 0.5) * 2000
          s.z = 2000
          s.pz = 2000
        }

        const sx = (s.x / s.z) * W + W / 2
        const sy = (s.y / s.z) * H + H / 2
        const px = (s.x / s.pz) * W + W / 2
        const py = (s.y / s.pz) * H + H / 2
        const bright = 1 - s.z / 2000
        const size = Math.max(0.3, bright * 2.5)

        // colour: white → blue → cyan at high speed
        const r = Math.floor(bright * (spd > 15 ? 100 : 255))
        const g = Math.floor(bright * (spd > 15 ? 150 : 255))
        const b = 255

        ctx.strokeStyle = `rgba(${r},${g},${b},${bright})`
        ctx.lineWidth = size
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }

      // warp vignette glow
      if (spd > 10) {
        const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.6)
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(1, `rgba(0,50,100,${Math.min(0.4, (spd - 10) / 40)})`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }
    }
    draw()

    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', init) }
  }, [])

  const toggleWarp = () => {
    setWarping(w => {
      const next = !w
      // smoothly ramp speed
      let target = next ? 50 : 4
      const ramp = setInterval(() => {
        speedRef.current += next ? 2 : -2
        if (next ? speedRef.current >= target : speedRef.current <= target) {
          speedRef.current = target
          clearInterval(ramp)
        }
      }, 30)
      return next
    })
  }

  return (
    <div className='relative rounded-xl overflow-hidden bg-black' style={{ height: '500px' }}>
      <canvas ref={canvasRef} className='w-full h-full' />
      <div className='absolute top-4 left-1/2 -translate-x-1/2 text-center pointer-events-none'>
        <p className='text-white/30 font-mono text-xs tracking-widest uppercase'>
          {warping ? '— WARP DRIVE ENGAGED —' : '— IMPULSE SPEED —'}
        </p>
      </div>
      <button onClick={toggleWarp}
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-8 py-3 rounded-full font-bold text-sm
          transition-all duration-300 shadow-lg
          ${warping
            ? 'bg-red-500 text-white shadow-red-500/40 hover:bg-red-400'
            : 'bg-cyan-400 text-black shadow-cyan-400/40 hover:bg-cyan-300'}`}>
        {warping ? '🛑 Disengage Warp' : '🚀 Engage Warp Drive'}
      </button>
    </div>
  )
}

export default WarpSpeed
