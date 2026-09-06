import { useState, useRef, useEffect, useCallback } from 'react'
import { createWorker } from 'tesseract.js'

const OCRTool = () => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const workerRef = useRef(null)
  const fileRef = useRef(null)

  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lang, setLang] = useState('eng')
  const [image, setImage] = useState(null)
  const [copied, setCopied] = useState(false)

  // Start camera
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {}
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const runOCR = useCallback(async (imgSrc) => {
    setLoading(true); setProgress(0); setText('')
    try {
      if (!workerRef.current) {
        workerRef.current = await createWorker(lang, 1, {
          logger: (m) => { if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100)) }
        })
      }
      const { data } = await workerRef.current.recognize(imgSrc)
      setText(data.text || 'No text detected')
    } catch (err) { setText('OCR failed: ' + err.message) }
    setLoading(false)
  }, [lang])

  const captureFromCamera = () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const img = canvas.toDataURL('image/png')
    setImage(img); runOCR(img)
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setImage(reader.result); runOCR(reader.result) }
    reader.readAsDataURL(file)
  }

  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Camera / Image */}
      <div style={{ flex: '0 0 auto', width: '100%', maxWidth: 500 }}>
        <div className="relative rounded-2xl overflow-hidden border border-gray-800 bg-black" style={{ aspectRatio: '4/3' }}>
          {image ? (
            <img src={image} alt="OCR input" className="w-full h-full object-contain" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 justify-center">
          <button onClick={captureFromCamera} disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ff980055', background: 'linear-gradient(135deg, #ff980022, #ffd54f15)', color: '#ff9800', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            Capture & Scan
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ffffff15', background: 'var(--luxe-surface)', color: 'var(--luxe-fg-muted)', fontSize: 12, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            Upload Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
          {image && <button onClick={() => { setImage(null); setText('') }}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ffffff15', background: 'var(--luxe-surface)', color: 'var(--luxe-fg-dim)', fontSize: 12, cursor: 'pointer' }}>
            Clear
          </button>}
          <select value={lang} onChange={e => { setLang(e.target.value); workerRef.current?.terminate(); workerRef.current = null }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ffffff15', background: 'var(--luxe-surface)', color: 'var(--luxe-fg-muted)', fontSize: 12 }}>
            <option value="eng">English</option>
            <option value="hin">Hindi</option>
            <option value="jpn">Japanese</option>
            <option value="chi_sim">Chinese</option>
            <option value="spa">Spanish</option>
            <option value="fra">French</option>
            <option value="deu">German</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: '1 1 280px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && (
          <div style={{ background: 'linear-gradient(135deg, #0d0d2bee, #1a1a3ecc)', borderRadius: 14, padding: 16, border: '1px solid #ffffff08' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: 'var(--luxe-fg-muted)' }}>Processing...</span>
              <span style={{ color: '#ff9800', fontWeight: 600 }}>{progress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--luxe-surface-hi)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #ff980066, #ff9800)', borderRadius: 3, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {text && !loading && (
          <div style={{ background: 'linear-gradient(135deg, #0d0d2bee, #1a1a3ecc)', borderRadius: 14, padding: 16, border: '1px solid #ffffff08' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#b388ff99', textTransform: 'uppercase', letterSpacing: 1 }}>Extracted Text</span>
              <button onClick={copy}
                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: copied ? '#4caf50' : 'var(--luxe-surface-hi)', color: 'var(--luxe-fg)', fontSize: 11, cursor: 'pointer' }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre style={{ color: 'var(--luxe-fg)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', background: 'var(--luxe-bg-elevated)', padding: 12, borderRadius: 8, fontFamily: 'monospace' }}>{text}</pre>
          </div>
        )}

        {!image && !loading && (
          <div style={{ background: 'linear-gradient(135deg, #0d0d2bee, #1a1a3ecc)', borderRadius: 14, padding: 24, border: '1px solid #ffffff08', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
            <p style={{ color: 'var(--luxe-fg-dim)', fontSize: 13 }}>Capture from camera or upload an image</p>
          </div>
        )}

        <div style={{ background: 'linear-gradient(135deg, #0d0d2bee, #1a1a3ecc)', borderRadius: 14, padding: 12, border: '1px solid #ffffff08' }}>
          <p style={{ color: 'var(--luxe-fg-dim)', fontSize: 11 }}>Tesseract.js OCR. 100+ languages. Runs in browser.</p>
        </div>
      </div>
    </div>
  )
}

export default OCRTool
