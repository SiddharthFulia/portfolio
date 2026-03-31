import { useEffect, useRef, useState, useCallback } from 'react'

const W = 800, H = 500

const renderMandelbrot = (canvas, vx, vy, vw, vh, maxIter) => {
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(W, H)
  for (let px = 0; px < W; px++) {
    for (let py = 0; py < H; py++) {
      const cx = vx + (px / W) * vw
      const cy = vy + (py / H) * vh
      let zx = 0, zy = 0, i = 0
      while (zx * zx + zy * zy < 4 && i < maxIter) {
        const tmp = zx * zx - zy * zy + cx
        zy = 2 * zx * zy + cy
        zx = tmp
        i++
      }
      const idx = (py * W + px) * 4
      if (i === maxIter) {
        img.data[idx] = img.data[idx+1] = img.data[idx+2] = 0
      } else {
        const t = i / maxIter
        // psychedelic electric palette
        img.data[idx]   = Math.floor(Math.sin(t * Math.PI * 3) * 127 + 128)
        img.data[idx+1] = Math.floor(Math.sin(t * Math.PI * 5 + 2) * 127 + 128)
        img.data[idx+2] = Math.floor(Math.sin(t * Math.PI * 7 + 4) * 127 + 128)
      }
      img.data[idx+3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

const INIT = { vx: -2.5, vy: -1.25, vw: 3.5, vh: 2.5 }

const FractalExplorer = () => {
  const canvasRef = useRef()
  const [view, setView] = useState(INIT)
  const [maxIter, setMaxIter] = useState(80)
  const [loading, setLoading] = useState(false)
  const [depth, setDepth] = useState(0)

  useEffect(() => {
    setLoading(true)
    const id = setTimeout(() => {
      renderMandelbrot(canvasRef.current, view.vx, view.vy, view.vw, view.vh, maxIter)
      setLoading(false)
    }, 20)
    return () => clearTimeout(id)
  }, [view, maxIter])

  const handleClick = useCallback(e => {
    if (loading) return
    const rect = canvasRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const cx = view.vx + px * view.vw
    const cy = view.vy + py * view.vh
    const nw = view.vw * 0.35
    const nh = view.vh * 0.35
    setView({ vx: cx - nw / 2, vy: cy - nh / 2, vw: nw, vh: nh })
    setMaxIter(i => Math.min(i + 40, 600))
    setDepth(d => d + 1)
  }, [view, loading])

  const reset = () => { setView(INIT); setMaxIter(80); setDepth(0) }

  return (
    <div className='bg-gray-900 rounded-xl p-5'>
      <div className='flex flex-wrap gap-3 mb-4 items-center'>
        <div className='text-sm text-gray-400'>
          Click anywhere to <span className='text-cyan-400'>zoom in</span>
        </div>
        <span className='text-xs text-gray-600'>Depth: <span className='text-purple-400'>{depth}×</span></span>
        <span className='text-xs text-gray-600'>Iterations: <span className='text-white'>{maxIter}</span></span>
        <button onClick={reset}
          className='ml-auto px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700'>
          Reset
        </button>
      </div>

      <div className='relative rounded-xl overflow-hidden' style={{ aspectRatio: `${W}/${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} className='w-full h-full cursor-zoom-in' onClick={handleClick} />
        {loading && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm'>
            <div className='text-center'>
              <div className='w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2' />
              <p className='text-cyan-400 text-xs font-mono'>Rendering {W * H / 1000}K pixels…</p>
            </div>
          </div>
        )}
      </div>

      <p className='text-xs text-gray-600 mt-3'>
        Mandelbrot set — z(n+1) = z(n)² + c · Each colour = escape speed · Black = never escapes (part of the set)
      </p>
    </div>
  )
}

export default FractalExplorer
