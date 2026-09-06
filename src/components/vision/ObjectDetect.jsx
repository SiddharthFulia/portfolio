import { useState, useEffect, useRef, useCallback } from 'react'
import { detectObjects, checkFaceHealth } from '../../api/face'

const CLASS_EMOJIS = {
  person: '🧑', cat: '🐱', dog: '🐶', car: '🚗', bottle: '🍶', cup: '☕',
  'cell phone': '📱', laptop: '💻', book: '📖', chair: '🪑', tv: '📺',
  bicycle: '🚲', bird: '🐦', backpack: '🎒', clock: '🕐', scissors: '✂️',
  keyboard: '⌨️', mouse: '🖱️', 'potted plant': '🪴', remote: '📱',
  'wine glass': '🍷', 'teddy bear': '🧸', pizza: '🍕', banana: '🍌',
}
const BOX_COLORS = ['#e91e8c', '#4fc3f7', '#ff9800', '#4caf50', '#b388ff', '#ffd54f', '#ef5350', '#26c6da']

function GlassCard({ title, children, style = {} }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #0d0d2bee, #1a1a3ecc)', borderRadius: 14, padding: 16, border: '1px solid #ffffff08', boxShadow: '0 4px 24px #00000040', ...style }}>
      {title && <div style={{ fontSize: 11, fontWeight: 600, color: '#b388ff99', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>}
      {children}
    </div>
  )
}

const ObjectDetect = () => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const pendingRef = useRef(false)
  const intervalRef = useRef(null)
  const fpsRef = useRef({ frames: 0, lastTime: Date.now() })
  const colorMapRef = useRef({})
  const colorIdxRef = useRef(0)
  const smoothedRef = useRef([])  // smoothed bounding boxes
  const animRef = useRef(null)

  const [serviceOnline, setServiceOnline] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [fps, setFps] = useState(0)
  const [processMs, setProcessMs] = useState(0)
  const [threshold, setThreshold] = useState(0.5)
  const [paused, setPaused] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })

  useEffect(() => { checkFaceHealth().then(setServiceOnline) }, [])

  const getColor = useCallback((cls) => {
    if (!colorMapRef.current[cls]) { colorMapRef.current[cls] = BOX_COLORS[colorIdxRef.current % BOX_COLORS.length]; colorIdxRef.current++ }
    return colorMapRef.current[cls]
  }, [])

  // Start camera
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) { setCameraError(err.message) }
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Detection loop — sends frames to server
  useEffect(() => {
    if (paused || !serviceOnline) return
    intervalRef.current = setInterval(() => {
      if (pendingRef.current) return
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      const vw = video.videoWidth, vh = video.videoHeight
      if (!vw || !vh) return

      // Downscale for speed
      const scale = Math.min(1, 320 / Math.max(vw, vh))
      canvas.width = Math.round(vw * scale)
      canvas.height = Math.round(vh * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.6)

      pendingRef.current = true
      const t0 = performance.now()

      detectObjects(base64, threshold).then(({ data }) => {
        setProcessMs(Math.round(performance.now() - t0))
        fpsRef.current.frames++
        const now = Date.now()
        if (now - fpsRef.current.lastTime >= 1000) { setFps(fpsRef.current.frames); fpsRef.current = { frames: 0, lastTime: now } }

        if (data?.objects) {
          setPredictions(data.objects)
          // Smooth: lerp towards new positions instead of snapping
          const newSmoothed = data.objects.map(obj => {
            const prev = smoothedRef.current.find(s => s.class === obj.class)
            if (prev) {
              const lerp = 0.4 // smoothing factor (0=frozen, 1=instant)
              return {
                ...obj,
                bbox: obj.bbox.map((v, i) => Math.round(prev.bbox[i] + (v - prev.bbox[i]) * lerp)),
              }
            }
            return { ...obj }
          })
          smoothedRef.current = newSmoothed
          drawBoxes(newSmoothed, data.imageSize?.width || canvas.width, data.imageSize?.height || canvas.height)
        }
      }).catch(() => {}).finally(() => { pendingRef.current = false })
    }, 400)
    return () => clearInterval(intervalRef.current)
  }, [paused, serviceOnline, threshold])

  // Draw bounding boxes (mirrored to match selfie video)
  const drawBoxes = (objects, imgW, imgH) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const w = overlay.width, h = overlay.height
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    const scaleX = w / imgW, scaleY = h / imgH

    objects.forEach(obj => {
      const [bx, by, bw, bh] = obj.bbox
      // Mirror X to match the scaleX(-1) on the video
      const x = w - (bx + bw) * scaleX, y = by * scaleY, ow = bw * scaleX, oh = bh * scaleY
      const color = getColor(obj.class)
      const corner = Math.min(14, ow * 0.15, oh * 0.15)

      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.6; ctx.strokeRect(x, y, ow, oh); ctx.globalAlpha = 1
      ctx.fillStyle = color; ctx.globalAlpha = 0.06; ctx.fillRect(x, y, ow, oh); ctx.globalAlpha = 1
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + ow - corner, y); ctx.lineTo(x + ow, y); ctx.lineTo(x + ow, y + corner); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y + oh - corner); ctx.lineTo(x, y + oh); ctx.lineTo(x + corner, y + oh); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + ow - corner, y + oh); ctx.lineTo(x + ow, y + oh); ctx.lineTo(x + ow, y + oh - corner); ctx.stroke()

      const emoji = CLASS_EMOJIS[obj.class] || '📦'
      const label = `${emoji} ${obj.class} ${Math.round(obj.score * 100)}%`
      ctx.font = 'bold 13px system-ui'
      const tw = ctx.measureText(label).width
      ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.roundRect(x, y - 24, tw + 12, 22, 4); ctx.fill(); ctx.globalAlpha = 1
      ctx.fillStyle = '#fff'; ctx.fillText(label, x + 6, y - 8)
    })
  }

  // Resize overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const container = overlay.parentElement
    if (!container || typeof ResizeObserver === 'undefined') return
    const sync = () => { const r = container.getBoundingClientRect(); overlay.width = r.width; overlay.height = r.height }
    sync()
    const ro = new ResizeObserver(sync); ro.observe(container)
    return () => ro.disconnect()
  }, [videoDims])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ flex: '0 0 auto', width: '100%', maxWidth: 640 }}>
        <div className="relative rounded-2xl overflow-hidden border border-gray-800 bg-black" style={{ aspectRatio: '4/3' }}>
          {cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">{cameraError}</div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => { const v = videoRef.current; if (v) setVideoDims({ w: v.videoWidth, h: v.videoHeight }) }}
                className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </>
          )}
          {!serviceOnline && serviceOnline !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
                <div style={{ fontSize: 15, color: '#e91e8c', fontWeight: 600 }}>Detection Service Offline</div>
                <div style={{ fontSize: 12, color: 'var(--luxe-fg-muted)', marginTop: 4 }}>Start the Python service with YOLOv8</div>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 justify-center">
          <button onClick={() => setPaused(p => !p)}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${!paused ? '#e91e8c55' : '#ffffff15'}`, background: !paused ? 'linear-gradient(135deg, #e91e8c22, #b388ff15)' : '#0d0d2b', color: !paused ? '#e91e8c' : '#666', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Threshold</span>
            <input type="range" min="0.1" max="0.9" step="0.05" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
            <span className="text-xs text-pink-400 font-mono">{Math.round(threshold * 100)}%</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--luxe-fg-muted)', padding: '6px 10px', background: 'var(--luxe-surface)', borderRadius: 8, border: '1px solid #ffffff10' }}>
            <span style={{ color: '#e91e8c', fontWeight: 600 }}>{fps}</span> FPS
            <span style={{ color: 'var(--luxe-fg-dim)', marginLeft: 8 }}>{processMs}ms</span>
          </div>
        </div>
      </div>

      <div style={{ flex: '1 1 240px', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GlassCard title={`Detected (${predictions.length})`}>
          {predictions.length === 0 ? (
            <p className="text-gray-600 text-xs">Point camera at objects...</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {predictions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--luxe-surface)' }}>
                  <span className="text-lg">{CLASS_EMOJIS[p.class] || '📦'}</span>
                  <span className="text-white text-sm capitalize flex-1">{p.class}</span>
                  <span className="text-xs font-mono" style={{ color: getColor(p.class) }}>{Math.round(p.score * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
        <GlassCard>
          <p style={{ color: 'var(--luxe-fg-dim)', fontSize: 11 }}>YOLOv8-nano on server. 80 classes. No download needed on your device.</p>
        </GlassCard>
      </div>
    </div>
  )
}

export default ObjectDetect
