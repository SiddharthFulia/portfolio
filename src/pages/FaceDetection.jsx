import { useState, useEffect, useRef, useCallback } from 'react'
import { analyzeFace, checkFaceHealth } from '../api/face'
import { createWorker } from 'tesseract.js'

const MOOD_EMOJI = { happy: '😄', sad: '😢', angry: '😠', surprised: '😲', sleepy: '😴', neutral: '😐' }
const MOOD_COLORS = {
  happy: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', hex: '#facc15' },
  sad: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', hex: '#60a5fa' },
  angry: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', hex: '#f87171' },
  surprised: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40', hex: '#c084fc' },
  sleepy: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/40', hex: '#818cf8' },
  neutral: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/40', hex: '#9ca3af' },
}

const LANDMARK_COLORS = { jaw: '#4fc3f7', eyebrow: '#ff9800', nose: '#b388ff', eye: '#4caf50', lip: '#e91e8c' }
function getLandmarkColor(i) {
  if (i <= 16) return LANDMARK_COLORS.jaw
  if (i <= 26) return LANDMARK_COLORS.eyebrow
  if (i <= 35) return LANDMARK_COLORS.nose
  if (i <= 47) return LANDMARK_COLORS.eye
  return LANDMARK_COLORS.lip
}

const LANDMARK_LINES = {
  jaw: Array.from({ length: 17 }, (_, i) => i),
  leftEyebrow: [17, 18, 19, 20, 21], rightEyebrow: [22, 23, 24, 25, 26],
  noseBridge: [27, 28, 29, 30], noseBottom: [31, 32, 33, 34, 35],
  leftEye: [36, 37, 38, 39, 40, 41, 36], rightEye: [42, 43, 44, 45, 46, 47, 42],
  outerLips: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 48],
  innerLips: [60, 61, 62, 63, 64, 65, 66, 67, 60],
}

// Object detection class emojis
const CLASS_EMOJIS = {
  person: '🧑', cat: '🐱', dog: '🐶', car: '🚗', bottle: '🍶', cup: '☕',
  'cell phone': '📱', laptop: '💻', book: '📖', chair: '🪑', tv: '📺',
  bicycle: '🚲', bird: '🐦', backpack: '🎒', clock: '🕐', scissors: '✂️',
  keyboard: '⌨️', mouse: '🖱️', 'potted plant': '🪴', remote: '📱',
}
const BOX_COLORS = ['#e91e8c', '#4fc3f7', '#ff9800', '#4caf50', '#b388ff', '#ffd54f', '#ef5350', '#26c6da']

const FaceDetection = () => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const pendingRef = useRef(false)
  const bounceRef = useRef(0)

  const [serviceOnline, setServiceOnline] = useState(null)
  const [faceData, setFaceData] = useState(null)
  const [noFace, setNoFace] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [fps, setFps] = useState(0)
  const [processMs, setProcessMs] = useState(0)
  const [moodHistory, setMoodHistory] = useState([])
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showBox, setShowBox] = useState(true)
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })

  // OCR state
  const [ocrText, setOcrText] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrLang, setOcrLang] = useState('eng')
  const ocrWorkerRef = useRef(null)
  const ocrFileRef = useRef(null)
  const [ocrImage, setOcrImage] = useState(null)
  const [ocrCopied, setOcrCopied] = useState(false)

  // Object detection state
  const [mode, setMode] = useState('face') // 'face' | 'object' | 'ocr'
  const [objModelStatus, setObjModelStatus] = useState('idle')
  const objModelRef = useRef(null)
  const objAnimRef = useRef(null)
  const [objPredictions, setObjPredictions] = useState([])
  const [objFps, setObjFps] = useState(0)
  const [objThreshold, setObjThreshold] = useState(0.5)
  const objFpsRef = useRef({ frames: 0, lastTime: Date.now() })
  const colorMapRef = useRef({})
  const colorIdxRef = useRef(0)
  const threshRef = useRef(0.5)
  useEffect(() => { threshRef.current = objThreshold }, [objThreshold])

  const fpsCounter = useRef({ frames: 0, lastTime: Date.now() })

  // Check face health
  useEffect(() => { checkFaceHealth().then(setServiceOnline) }, [])

  // Auto-start camera
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) { setCameraError(err.message || 'Camera access denied') }
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const handleVideoReady = useCallback(() => {
    const v = videoRef.current
    if (v) setVideoDims({ w: v.videoWidth, h: v.videoHeight })
  }, [])

  // ═══ FACE DETECTION LOOP ═══
  useEffect(() => {
    if (mode !== 'face' || isPaused || !serviceOnline) return
    intervalRef.current = setInterval(() => {
      if (pendingRef.current) return
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      const vw = video.videoWidth, vh = video.videoHeight
      if (!vw || !vh) return
      const scale = Math.min(1, 320 / Math.max(vw, vh))
      canvas.width = Math.round(vw * scale)
      canvas.height = Math.round(vh * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.5)
      pendingRef.current = true
      const t0 = performance.now()
      analyzeFace(base64).then(({ data }) => {
        setProcessMs(Math.round(performance.now() - t0))
        fpsCounter.current.frames++
        const now = Date.now()
        if (now - fpsCounter.current.lastTime >= 1000) {
          setFps(fpsCounter.current.frames)
          fpsCounter.current = { frames: 0, lastTime: now }
        }
        if (data?.faces?.length > 0) {
          setFaceData(data); setNoFace(false)
          const mood = data.faces[0].mood
          if (mood) setMoodHistory(prev => [...prev, { mood, confidence: data.faces[0].moodConfidence || 0 }].slice(-20))
        } else { setFaceData(data); setNoFace(true) }
      }).catch(() => setNoFace(true)).finally(() => { pendingRef.current = false })
    }, 150)
    return () => clearInterval(intervalRef.current)
  }, [mode, isPaused, serviceOnline])

  // ═══ FACE OVERLAY DRAWING ═══
  useEffect(() => {
    if (mode !== 'face') return
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const w = overlay.width, h = overlay.height
    ctx.clearRect(0, 0, w, h)
    if (!faceData?.faces?.length) return
    const imgW = faceData.imageSize?.width || 320
    const imgH = faceData.imageSize?.height || 240
    const scaleX = w / imgW, scaleY = h / imgH
    const mirrorX = (x) => w - x * scaleX
    const mapY = (y) => y * scaleY

    faceData.faces.forEach(face => {
      const bb = face.boundingBox
      if (showBox && bb) {
        const bx = mirrorX(bb.x + bb.width), by = mapY(bb.y)
        const bw = bb.width * scaleX, bh = bb.height * scaleY
        const corner = 14
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
        ctx.strokeRect(bx, by, bw, bh); ctx.setLineDash([])
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(bx, by + corner); ctx.lineTo(bx, by); ctx.lineTo(bx + corner, by); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(bx + bw - corner, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + corner); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(bx, by + bh - corner); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + corner, by + bh); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(bx + bw - corner, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - corner); ctx.stroke()
        if (face.confidence) { ctx.font = 'bold 11px monospace'; ctx.fillStyle = '#22d3ee'; ctx.textAlign = 'left'; ctx.fillText(`${Math.round(face.confidence * 100)}%`, bx + 4, by + bh + 14) }
      }

      const pts = face.landmarks?.points
      if (showLandmarks && pts?.length === 68) {
        const mapped = pts.map(p => [mirrorX(Array.isArray(p) ? p[0] : p.x), mapY(Array.isArray(p) ? p[1] : p.y)])
        // Connected lines
        Object.entries(LANDMARK_LINES).forEach(([, indices]) => {
          ctx.beginPath(); ctx.strokeStyle = getLandmarkColor(indices[0]) + 'bb'; ctx.lineWidth = 1.5
          indices.forEach((idx, i) => { const [px, py] = mapped[idx]; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py) })
          ctx.stroke()
        })
        // Highlighted lip fill when smiling
        if (face.features?.smiling) {
          ctx.beginPath(); ctx.fillStyle = '#e91e8c22'
          LANDMARK_LINES.outerLips.forEach((idx, i) => { const [px, py] = mapped[idx]; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py) })
          ctx.fill()
        }
        // Eye highlight fill
        ;['leftEye', 'rightEye'].forEach(eyeKey => {
          ctx.beginPath(); ctx.fillStyle = '#4caf5018'
          LANDMARK_LINES[eyeKey].forEach((idx, i) => { const [px, py] = mapped[idx]; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py) })
          ctx.fill()
        })
        // Dots
        mapped.forEach(([px, py], idx) => { ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fillStyle = getLandmarkColor(idx); ctx.fill() })
      }

      // Mood emoji + label
      const mood = face.mood
      if (mood && bb) {
        bounceRef.current = (bounceRef.current + 1) % 60
        const bY = Math.sin((bounceRef.current / 60) * Math.PI * 2) * 5
        const cx = mirrorX(bb.x + bb.width / 2), cy = mapY(bb.y) - 20 + bY
        ctx.font = '32px serif'; ctx.textAlign = 'center'; ctx.fillText(MOOD_EMOJI[mood] || '😐', cx, cy)
        ctx.font = 'bold 12px system-ui'; ctx.fillStyle = MOOD_COLORS[mood]?.hex || '#9ca3af'; ctx.fillText(mood.toUpperCase(), cx, cy + 18)
      }
      if (face.features?.smiling && bb) {
        ctx.font = 'bold 10px system-ui'; ctx.fillStyle = '#4ade80'; ctx.textAlign = 'center'
        ctx.fillText('😊 SMILING', mirrorX(bb.x + bb.width / 2), mapY(bb.y + bb.height) + 12)
      }
    })
  }, [mode, faceData, showLandmarks, showBox])

  // ═══ OBJECT DETECTION ═══
  // Load TF.js + COCO-SSD
  useEffect(() => {
    if (mode !== 'object') return
    if (objModelRef.current) { setObjModelStatus('ready'); return }
    let cancelled = false
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script'); s.src = src; s.async = true; s.onload = resolve; s.onerror = reject; document.head.appendChild(s)
    })
    const init = async () => {
      try {
        setObjModelStatus('loading-tf')
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs')
        if (cancelled) return
        setObjModelStatus('loading-model')
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd')
        if (cancelled) return
        const model = await window.cocoSsd.load()
        if (cancelled) return
        objModelRef.current = model
        setObjModelStatus('ready')
      } catch { if (!cancelled) setObjModelStatus('error') }
    }
    init()
    return () => { cancelled = true }
  }, [mode])

  const getColor = useCallback((cls) => {
    if (!colorMapRef.current[cls]) { colorMapRef.current[cls] = BOX_COLORS[colorIdxRef.current % BOX_COLORS.length]; colorIdxRef.current++ }
    return colorMapRef.current[cls]
  }, [])

  // Object detection loop
  useEffect(() => {
    if (mode !== 'object' || objModelStatus !== 'ready' || isPaused) return
    const loop = async () => {
      const video = videoRef.current, overlay = overlayRef.current
      if (!video || !overlay || video.readyState < 2) { objAnimRef.current = requestAnimationFrame(loop); return }
      const w = video.videoWidth, h = video.videoHeight
      if (overlay.width !== w) overlay.width = w
      if (overlay.height !== h) overlay.height = h
      const ctx = overlay.getContext('2d')
      objFpsRef.current.frames++
      const now = Date.now()
      if (now - objFpsRef.current.lastTime >= 1000) { setObjFps(objFpsRef.current.frames); objFpsRef.current = { frames: 0, lastTime: now } }

      const preds = await objModelRef.current.detect(video)
      const filtered = preds.filter(p => p.score >= threshRef.current)
      setObjPredictions(filtered)

      ctx.clearRect(0, 0, w, h)
      for (const pred of filtered) {
        const [x, y, bw, bh] = pred.bbox
        const color = getColor(pred.class)
        const corner = Math.min(14, bw * 0.15, bh * 0.15)
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.6; ctx.strokeRect(x, y, bw, bh); ctx.globalAlpha = 1
        ctx.fillStyle = color; ctx.globalAlpha = 0.06; ctx.fillRect(x, y, bw, bh); ctx.globalAlpha = 1
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x + bw - corner, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + corner); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x, y + bh - corner); ctx.lineTo(x, y + bh); ctx.lineTo(x + corner, y + bh); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x + bw - corner, y + bh); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw, y + bh - corner); ctx.stroke()
        const emoji = CLASS_EMOJIS[pred.class] || ''
        const label = `${emoji} ${pred.class} ${Math.round(pred.score * 100)}%`
        ctx.font = 'bold 13px system-ui'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.roundRect(x, y - 24, tw + 12, 22, 4); ctx.fill(); ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'; ctx.fillText(label, x + 6, y - 8)
      }
      objAnimRef.current = requestAnimationFrame(loop)
    }
    objAnimRef.current = requestAnimationFrame(loop)
    return () => { if (objAnimRef.current) cancelAnimationFrame(objAnimRef.current) }
  }, [mode, objModelStatus, isPaused, getColor])

  // ═══ OCR ═══
  const runOCR = useCallback(async (imgSrc) => {
    setOcrLoading(true); setOcrProgress(0); setOcrText('')
    try {
      if (!ocrWorkerRef.current) {
        const worker = await createWorker(ocrLang, 1, {
          logger: (m) => { if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100)) }
        })
        ocrWorkerRef.current = worker
      }
      const { data } = await ocrWorkerRef.current.recognize(imgSrc)
      setOcrText(data.text || 'No text detected')
    } catch (err) {
      setOcrText('OCR failed: ' + err.message)
    }
    setOcrLoading(false)
  }, [ocrLang])

  const handleOcrUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setOcrImage(reader.result); runOCR(reader.result) }
    reader.readAsDataURL(file)
  }

  const captureOcrFromCamera = () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const img = canvas.toDataURL('image/png')
    setOcrImage(img); runOCR(img)
  }

  const copyOcrText = () => {
    navigator.clipboard.writeText(ocrText).then(() => { setOcrCopied(true); setTimeout(() => setOcrCopied(false), 2000) })
  }

  // Cleanup OCR worker on unmount
  useEffect(() => () => { ocrWorkerRef.current?.terminate() }, [])

  // Clear overlay when switching modes
  useEffect(() => {
    const overlay = overlayRef.current
    if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
    setFaceData(null); setObjPredictions([]); setNoFace(false)
  }, [mode])

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

  const face = faceData?.faces?.[0]
  const moodColor = MOOD_COLORS[face?.mood] || MOOD_COLORS.neutral

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        <h1 className="font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight mb-2">
          Vision AI
        </h1>
        <p className="text-gray-400 text-sm max-w-xl mb-4">
          Real-time face analysis & object detection — all running live in your browser.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode('face')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${mode === 'face' ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            Face Detection
          </button>
          <button onClick={() => setMode('object')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${mode === 'object' ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            Object Detection
          </button>
          <button onClick={() => setMode('ocr')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${mode === 'ocr' ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            OCR / Text
          </button>
        </div>

        {/* Status */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {mode === 'face' && (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${serviceOnline === null ? 'bg-gray-600 animate-pulse' : serviceOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-500">{serviceOnline ? 'Face service online' : 'Face service offline'}</span>
              </div>
              {!isPaused && <><span className="text-xs text-gray-600"><span className="text-cyan-400 font-mono">{fps}</span> FPS</span>
              <span className="text-xs text-gray-600"><span className="text-purple-400 font-mono">{processMs}</span>ms</span></>}
            </>
          )}
          {mode === 'object' && (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${objModelStatus === 'ready' ? 'bg-green-500' : objModelStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                <span className="text-xs text-gray-500">{objModelStatus === 'ready' ? 'COCO-SSD loaded' : objModelStatus.includes('loading') ? 'Loading TF.js model...' : objModelStatus === 'error' ? 'Failed to load model' : 'Idle'}</span>
              </div>
              {objModelStatus === 'ready' && <span className="text-xs text-gray-600"><span className="text-pink-400 font-mono">{objFps}</span> FPS</span>}
              {objPredictions.length > 0 && <span className="text-xs text-gray-600"><span className="text-orange-400 font-mono">{objPredictions.length}</span> objects</span>}
            </>
          )}
          {mode === 'ocr' && (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${ocrLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="text-xs text-gray-500">{ocrLoading ? `Processing... ${ocrProgress}%` : 'Tesseract.js ready'}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl overflow-hidden border border-gray-800 bg-black">
              {cameraError ? (
                <div className="aspect-video flex items-center justify-center text-red-400 text-sm p-6 text-center">{cameraError}</div>
              ) : (
                <div className="relative aspect-video">
                  <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={handleVideoReady}
                    className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" style={mode === 'object' ? { transform: 'scaleX(-1)' } : undefined} />
                  <canvas ref={canvasRef} className="hidden" />
                  {mode === 'face' && noFace && <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 rounded text-xs text-gray-400">No face detected</div>}
                </div>
              )}
              <div className="flex items-center gap-2 p-3 border-t border-gray-800 flex-wrap">
                <button onClick={() => setIsPaused(p => !p)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${isPaused ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                {mode === 'face' && (
                  <>
                    <button onClick={() => setShowLandmarks(l => !l)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold ${showLandmarks ? 'bg-purple-600/30 text-purple-400' : 'bg-gray-800 text-gray-500'}`}>Landmarks</button>
                    <button onClick={() => setShowBox(b => !b)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold ${showBox ? 'bg-cyan-600/30 text-cyan-400' : 'bg-gray-800 text-gray-500'}`}>Box</button>
                  </>
                )}
                {mode === 'object' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-gray-500">Threshold</span>
                    <input type="range" min="0.1" max="0.9" step="0.05" value={objThreshold} onChange={e => setObjThreshold(parseFloat(e.target.value))}
                      className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                    <span className="text-xs text-pink-400 font-mono w-8">{Math.round(objThreshold * 100)}%</span>
                  </div>
                )}
                {mode === 'ocr' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <button onClick={captureOcrFromCamera} disabled={ocrLoading}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                      Capture & Scan
                    </button>
                    <button onClick={() => ocrFileRef.current?.click()} disabled={ocrLoading}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                      Upload Image
                    </button>
                    <input ref={ocrFileRef} type="file" accept="image/*" onChange={handleOcrUpload} className="hidden" />
                    <select value={ocrLang} onChange={e => { setOcrLang(e.target.value); ocrWorkerRef.current?.terminate(); ocrWorkerRef.current = null }}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg focus:outline-none">
                      <option value="eng">English</option>
                      <option value="hin">Hindi</option>
                      <option value="jpn">Japanese</option>
                      <option value="chi_sim">Chinese</option>
                      <option value="spa">Spanish</option>
                      <option value="fra">French</option>
                      <option value="deu">German</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results panel */}
          <div className="space-y-4">
            {mode === 'face' && (
              <>
                {face?.mood ? (
                  <div className={`p-5 rounded-2xl border ${moodColor.border} ${moodColor.bg}`}>
                    <div className="text-center">
                      <div className="text-5xl mb-2">{MOOD_EMOJI[face.mood]}</div>
                      <div className={`text-xl font-black capitalize ${moodColor.text}`}>{face.mood}</div>
                      {face.moodConfidence != null && <div className="text-xs text-gray-500 mt-1">{Math.round(face.moodConfidence * 100)}%</div>}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900 text-center text-gray-600">
                    <div className="text-4xl mb-2">👤</div><div className="text-sm">Waiting for face...</div>
                  </div>
                )}
                {face?.features && (
                  <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900 space-y-3">
                    <h3 className="text-white font-bold text-sm">Features</h3>
                    {[{ label: 'Left Eye', value: face.features.leftEyeOpen, max: 0.4 },
                      { label: 'Right Eye', value: face.features.rightEyeOpen, max: 0.4 },
                      { label: 'Mouth', value: face.features.mouthOpen, max: 0.6 }].map(f => (
                      <div key={f.label}>
                        <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">{f.label}</span><span className="text-cyan-400 font-mono">{(f.value * 100).toFixed(0)}%</span></div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (f.value / f.max) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-gray-800">
                      <span className="text-xs text-gray-500">Smiling</span>
                      <span className={`text-xs font-bold ${face.features.smiling ? 'text-green-400' : 'text-gray-600'}`}>{face.features.smiling ? '😊 Yes' : 'No'}</span>
                    </div>
                  </div>
                )}
                {face?.faceAngle != null && (
                  <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900 flex items-center gap-4">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 border-2 border-gray-700 rounded-full" />
                      <div className="absolute inset-1.5 border-2 border-cyan-500 rounded-full" style={{ transform: `rotate(${face.faceAngle}deg)` }}>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-cyan-400 rounded-full" />
                      </div>
                    </div>
                    <div><div className="text-white font-mono text-sm">{face.faceAngle.toFixed(1)}°</div>
                    <div className="text-gray-500 text-[10px]">{Math.abs(face.faceAngle) < 3 ? 'Straight' : face.faceAngle > 0 ? 'Tilted right' : 'Tilted left'}</div></div>
                  </div>
                )}
                {moodHistory.length > 3 && (
                  <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
                    <h3 className="text-gray-400 text-xs font-semibold mb-2">Mood History</h3>
                    <div className="flex gap-0.5 items-end h-8">
                      {moodHistory.map((m, i) => (
                        <div key={i} className="flex-1 rounded-sm transition-all duration-200"
                          style={{ height: `${Math.max(20, m.confidence * 100)}%`, backgroundColor: MOOD_COLORS[m.mood]?.hex || '#666' }} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {mode === 'object' && (
              <>
                {objModelStatus.includes('loading') && (
                  <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900 space-y-3">
                    <div className="animate-pulse bg-gray-800 h-4 w-3/4 rounded" />
                    <div className="animate-pulse bg-gray-800 h-3 w-1/2 rounded" />
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-pink-500 to-orange-500 rounded-full animate-pulse" style={{ width: objModelStatus === 'loading-tf' ? '30%' : '70%' }} />
                    </div>
                    <p className="text-gray-500 text-xs">{objModelStatus === 'loading-tf' ? 'Loading TensorFlow.js...' : 'Loading COCO-SSD model...'}</p>
                  </div>
                )}
                {objModelStatus === 'ready' && (
                  <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900">
                    <h3 className="text-white font-bold text-sm mb-3">Detected Objects</h3>
                    {objPredictions.length === 0 ? (
                      <p className="text-gray-600 text-xs">Point camera at objects...</p>
                    ) : (
                      <div className="space-y-2">
                        {objPredictions.map((p, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
                            <span className="text-lg">{CLASS_EMOJIS[p.class] || '📦'}</span>
                            <span className="text-white text-sm font-medium capitalize flex-1">{p.class}</span>
                            <span className="text-xs font-mono" style={{ color: getColor(p.class) }}>{Math.round(p.score * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
                  <h3 className="text-gray-400 text-xs font-semibold mb-2">About</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">TensorFlow.js + COCO-SSD, 80 object classes, runs in your browser.</p>
                </div>
              </>
            )}

            {mode === 'ocr' && (
              <>
                {/* OCR Preview */}
                {ocrImage && (
                  <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                    <img src={ocrImage} alt="OCR input" className="w-full max-h-48 object-contain bg-black" />
                  </div>
                )}

                {/* Progress */}
                {ocrLoading && (
                  <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-400">Processing...</span>
                      <span className="text-amber-400 font-mono">{ocrProgress}%</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Result */}
                {ocrText && !ocrLoading && (
                  <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-bold text-sm">Extracted Text</h3>
                      <button onClick={copyOcrText}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${ocrCopied ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                        {ocrCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto font-mono bg-gray-950 p-3 rounded-lg">{ocrText}</pre>
                  </div>
                )}

                {!ocrImage && !ocrLoading && (
                  <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900 text-center">
                    <div className="text-4xl mb-2">📝</div>
                    <p className="text-gray-500 text-sm">Capture from camera or upload an image to extract text</p>
                  </div>
                )}

                <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
                  <h3 className="text-gray-400 text-xs font-semibold mb-2">About</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">Tesseract.js OCR engine, supports 100+ languages, runs in your browser.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FaceDetection
