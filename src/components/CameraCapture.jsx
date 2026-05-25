import { useState, useRef, useEffect } from 'react'
import { CameraOutlined, CheckOutlined, CloseOutlined, SwapOutlined } from '@ant-design/icons'
import { notice } from '../lib/notice'
// Live camera → snapshot → data URL. Used by Image Studio so users can
// shoot a photo directly instead of uploading one from disk.
//
// Props:
//   onSnap(dataUrl, blob)  — fires when the user clicks "Use this"
//   facing                  — 'user' (front) or 'environment' (back). Default 'user'.
//                             The component also exposes a toggle in the UI.
//   accentColor             — Tailwind hex for the snap button glow
//
// Stream lifecycle:
//   • Camera is requested only when the user clicks the open button —
//     never autostarted on mount (saves battery + avoids the permission
//     prompt before the user shows intent).
//   • Closed on unmount, "Re-take", and "Use this" so the LED indicator
//     turns off promptly.
export default function CameraCapture({
  onSnap, facing: initialFacing = 'user', accentColor = '#22d3ee',
}) {
  const [state, setState] = useState('idle')   // idle | streaming | preview
  const [facing, setFacing] = useState(initialFacing)
  const [snap, setSnap] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const open = async (which = facing) => {
    try {
      stopStream()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: which, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setFacing(which); setState('streaming')
    } catch (e) {
      notice.error(`Could not access camera: ${e.message}`)
    }
  }

  const flip = () => open(facing === 'user' ? 'environment' : 'user')

  const takeShot = () => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c) return
    const w = v.videoWidth, h = v.videoHeight
    if (!w || !h) return
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    // Mirror the front-facing capture so the saved image matches what the
    // user saw on screen (the preview is mirrored via CSS). Back camera
    // captures stay as-is.
    if (facing === 'user') {
      ctx.translate(w, 0); ctx.scale(-1, 1)
    }
    ctx.drawImage(v, 0, 0, w, h)
    const dataUrl = c.toDataURL('image/jpeg', 0.92)
    setSnap(dataUrl); setState('preview'); stopStream()
  }

  const reset = () => {
    setSnap(''); setState('idle'); stopStream()
  }

  const accept = () => {
    if (!snap) return
    // Best-effort blob for callers that want one (file upload helpers, etc.)
    fetch(snap).then(r => r.blob()).then(b => onSnap?.(snap, b)).catch(() => onSnap?.(snap, null))
    reset()
  }

  if (state === 'streaming') {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-3">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
          <video ref={videoRef} autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
          <canvas ref={canvasRef} className="hidden" />
          <button onClick={flip}
            className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center rounded-full bg-black/70 hover:bg-black/90 text-gray-200 hover:text-white transition-colors"
            title={facing === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}>
            <SwapOutlined />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={takeShot}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-black transition-colors"
            style={{ background: accentColor }}>
            <CameraOutlined /> Snap
          </button>
          <button onClick={reset}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors">
            <CloseOutlined /> Cancel
          </button>
        </div>
      </div>
    )
  }

  if (state === 'preview' && snap) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-3">
        <img src={snap} alt="snapshot preview" className="w-full max-h-72 object-contain rounded-lg" />
        <div className="flex items-center gap-2">
          <button onClick={accept}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition-colors">
            <CheckOutlined /> Use this
          </button>
          <button onClick={() => open(facing)}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors">
            <CloseOutlined /> Re-take
          </button>
        </div>
      </div>
    )
  }

  // idle
  return (
    <button onClick={() => open()}
      className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-700 hover:border-gray-500 bg-gray-900/60 hover:bg-gray-900 text-gray-200 transition-colors">
      <CameraOutlined style={{ color: accentColor }} />
      Use camera
    </button>
  )
}

// Canvas transforms — exported so any caller (e.g. Image Studio) can
// re-use them on either an uploaded file OR a CameraCapture output.
//   transformImage(dataUrl, 'rotate-left')  → rotated −90°
//   transformImage(dataUrl, 'rotate-right') → rotated +90°
//   transformImage(dataUrl, 'mirror')       → flipped horizontally
export function transformImage(dataUrl, op) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return reject(new Error('empty data url'))
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      if (op === 'rotate-left' || op === 'rotate-right') {
        c.width = h; c.height = w
        ctx.translate(c.width / 2, c.height / 2)
        ctx.rotate(op === 'rotate-left' ? -Math.PI / 2 : Math.PI / 2)
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
      } else if (op === 'mirror') {
        c.width = w; c.height = h
        ctx.translate(w, 0); ctx.scale(-1, 1)
        ctx.drawImage(img, 0, 0, w, h)
      } else {
        c.width = w; c.height = h
        ctx.drawImage(img, 0, 0, w, h)
      }
      resolve(c.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}
