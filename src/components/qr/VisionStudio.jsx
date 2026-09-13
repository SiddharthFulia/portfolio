// VisionStudio — fourth top-level tab on /qr.
//
// Fully client-side vision pipeline that inspects any uploaded / captured
// image and auto-generates a QR from the extracted metadata. No BE calls.
// The primary pipeline is:
//
//   1. User drops / captures / pastes an image.
//   2. We render it to a hidden canvas → ImageData at ≤ 1024 px on the
//      longest edge (analysis buffer) + a 64×64 buffer (colour pass).
//   3. Run extractDominantColors (k-means, ~10 ms) and imageMetadata (loop
//      over the analysis buffer, ~5 ms) synchronously.
//   4. Run runOcr (lazy Tesseract.js — first call downloads ~4 MB of
//      language + WASM, subsequent calls are cached). Reports progress.
//   5. Show a Result panel: OCR text lines (copyable), palette swatches,
//      metadata tiles. Below it a "Suggested QR" card that says exactly
//      what payload + style we'd inject.
//   6. "Use this style" pushes the editor state into the parent
//      QRCompiler + swaps back to the 2D Editor tab.
//   7. Bonus: multi-image ZIP export. User drops N images, each produces
//      a rendered QR PNG using the derived style + payload. Downloads a
//      client-generated ZIP (uncompressed stored entries, no lib needed).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Progress, Tag } from 'antd'
import { Button } from '../ui'
import {
  InboxOutlined, ThunderboltFilled, CameraOutlined, PictureOutlined,
  CopyOutlined, DownloadOutlined, ReloadOutlined, FileZipOutlined,
  CheckCircleFilled, InfoCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import qrcode from 'qrcode-generator'
import {
  loadImage, toImageData, toDataUrl,
  extractDominantColors, imageMetadata, runOcr,
  paletteToEditorState,
} from '../../lib/imageAnalysis'
import { notice } from '../../lib/notice'

function FieldHelp({ children }) {
  return <p className='text-[11px] text-fg-muted mt-1 leading-snug'>{children}</p>
}

// Truncate + collapse whitespace so we never inject a giant OCR blob as
// the QR payload. 200 chars fits comfortably in an H-level version 10-ish
// QR, which is still a nice tight matrix.
function derivePayload(ocr, meta, palette) {
  const trimmed = (ocr?.text || '').replace(/\s+/g, ' ').trim()
  if (trimmed && trimmed.length > 8) {
    return trimmed.length > 200 ? trimmed.slice(0, 197) + '…' : trimmed
  }
  // Fallback: JSON summary of colours + orientation, so the QR still has
  // something meaningful when the image has no text.
  const colours = (palette || []).slice(0, 3).map((c) => c.hex).join(',')
  return `vision:${meta?.orientation || 'unknown'} ${colours}`
}

// Render a QR onto a canvas using the supplied style. Used both in the
// preview + the batch ZIP. Stripped-down copy of QRCompiler's core paint
// path — we only need square/rounded cells for the batch preview.
function renderQrToCanvas(payload, style, size = 512) {
  const ecc = style.ecc || 'H'
  const qr = qrcode(0, ecc)
  qr.addData(payload || 'https://siddharthfulia.com/qr')
  qr.make()
  const N = qr.getModuleCount()
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = style.bgColor || '#ffffff'
  ctx.fillRect(0, 0, size, size)

  const margin = Math.round(size * 0.06)
  const cell = (size - margin * 2) / N

  // Gradient fg
  let fill
  if (style.gradientOn && style.fgColor2) {
    const g = ctx.createLinearGradient(0, 0, size, size)
    g.addColorStop(0, style.fgColor)
    g.addColorStop(1, style.fgColor2)
    fill = g
  } else {
    fill = style.fgColor || '#0a0a0e'
  }
  ctx.fillStyle = fill

  const rounded = style.cellShape === 'Rounded'
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!qr.isDark(r, c)) continue
      const x = margin + c * cell
      const y = margin + r * cell
      if (rounded) {
        const rad = cell * 0.35
        ctx.beginPath()
        ctx.moveTo(x + rad, y)
        ctx.arcTo(x + cell, y, x + cell, y + cell, rad)
        ctx.arcTo(x + cell, y + cell, x, y + cell, rad)
        ctx.arcTo(x, y + cell, x, y, rad)
        ctx.arcTo(x, y, x + cell, y, rad)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
      }
    }
  }
  return canvas
}

// ─── ZIP writer (STORE, no compression) ───────────────────────────────
// We ship a hand-rolled writer instead of pulling in JSZip (~140KB) just
// for this bonus feature. Uncompressed local file headers + a central
// directory are enough — most OS unzips handle STORE entries fine.
function crc32(buf) {
  let c
  const table = crc32._t || (crc32._t = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      t[n] = c >>> 0
    }
    return t
  })())
  c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function writeZip(entries) {
  // entries: [{ name, data: Uint8Array }]
  const encoder = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const nameBytes = encoder.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length
    // Local file header (30 + name + data)
    const lfh = new DataView(new ArrayBuffer(30))
    lfh.setUint32(0, 0x04034b50, true)   // signature
    lfh.setUint16(4, 20, true)           // version
    lfh.setUint16(6, 0, true)            // flags
    lfh.setUint16(8, 0, true)            // method = STORE
    lfh.setUint16(10, 0, true); lfh.setUint16(12, 0, true) // time/date
    lfh.setUint32(14, crc, true)
    lfh.setUint32(18, size, true)
    lfh.setUint32(22, size, true)
    lfh.setUint16(26, nameBytes.length, true)
    lfh.setUint16(28, 0, true)           // extra length
    parts.push(new Uint8Array(lfh.buffer), nameBytes, e.data)

    // Central directory entry (46 + name)
    const cdh = new DataView(new ArrayBuffer(46))
    cdh.setUint32(0, 0x02014b50, true)
    cdh.setUint16(4, 20, true); cdh.setUint16(6, 20, true)
    cdh.setUint16(8, 0, true); cdh.setUint16(10, 0, true)
    cdh.setUint16(12, 0, true); cdh.setUint16(14, 0, true)
    cdh.setUint32(16, crc, true)
    cdh.setUint32(20, size, true); cdh.setUint32(24, size, true)
    cdh.setUint16(28, nameBytes.length, true)
    cdh.setUint16(30, 0, true); cdh.setUint16(32, 0, true)
    cdh.setUint16(34, 0, true); cdh.setUint16(36, 0, true)
    cdh.setUint32(38, 0, true)
    cdh.setUint32(42, offset, true)
    central.push(new Uint8Array(cdh.buffer), nameBytes)
    offset += 30 + nameBytes.length + size
  }
  const centralStart = offset
  let centralSize = 0
  for (const b of central) centralSize += b.length

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true)
  eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, centralStart, true)
  eocd.setUint16(20, 0, true)

  const blobParts = [...parts, ...central, new Uint8Array(eocd.buffer)]
  return new Blob(blobParts, { type: 'application/zip' })
}

function dataUrlToBytes(dataUrl) {
  const [, b64] = dataUrl.split(',')
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// ─── Main component ────────────────────────────────────────────────────
export default function VisionStudio({ onApplyStyle, currentPayload }) {
  const [file, setFile]           = useState(null)
  const [preview, setPreview]     = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [stage, setStage]         = useState('')
  const [progress, setProgress]   = useState(0)
  const [result, setResult]       = useState(null)   // { palette, meta, ocr, dataUrl }
  const [error, setError]         = useState('')

  // Batch
  const [batchFiles, setBatchFiles] = useState([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)

  // Camera
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch (e) {
      notice.error('Could not access the camera')
    }
  }
  const stopCamera = () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch {}
    streamRef.current = null
    setCameraOn(false)
  }
  useEffect(() => () => stopCamera(), [])

  const captureFromCamera = () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const f = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' })
      setFile(f)
      setResult(null)
      setError('')
      const url = URL.createObjectURL(blob)
      setPreview(url)
      stopCamera()
    }, 'image/png')
  }

  // Paste from clipboard (Ctrl+V anywhere on the tab)
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          const f = it.getAsFile()
          if (f) {
            setFile(f)
            setResult(null)
            setError('')
            setPreview(URL.createObjectURL(f))
            notice.info('Pasted image from clipboard')
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const uploadProps = {
    name: 'image',
    multiple: false,
    accept: 'image/jpeg,image/png,image/webp',
    showUploadList: false,
    beforeUpload: (f) => {
      setFile(f)
      setResult(null)
      setError('')
      setPreview(URL.createObjectURL(f))
      return false
    },
  }

  // Multi-file uploader for the batch section.
  const batchUploadProps = {
    name: 'images',
    multiple: true,
    accept: 'image/jpeg,image/png,image/webp',
    showUploadList: false,
    beforeUpload: (f, list) => {
      setBatchFiles((prev) => {
        // antd calls beforeUpload once per file; collapse into a single set.
        const next = [...prev]
        if (!next.includes(f)) next.push(f)
        return next.slice(0, 20)   // safety cap
      })
      return false
    },
  }

  const runScan = async () => {
    if (!file) { notice.warning('Drop or capture an image first'); return }
    setAnalyzing(true); setError(''); setResult(null); setProgress(0)
    try {
      setStage('Decoding image…')
      const img = await loadImage(file)

      setStage('Extracting colours…')
      const colorBuf = toImageData(img, 64)
      const palette = extractDominantColors(colorBuf, 6)
      setProgress(15)

      setStage('Analysing composition…')
      const analysisBuf = toImageData(img, 1024)
      const meta = imageMetadata(analysisBuf)
      setProgress(30)

      setStage('Reading text…')
      let ocr = { text: '', lines: [], confidence: null, wordCount: 0 }
      try {
        ocr = await runOcr(file, (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(30 + Math.round(m.progress * 60))
          } else if (m.status && m.progress != null) {
            // Loading model / initialising — nudge the bar so it doesn't stall.
            setProgress(Math.min(28, Math.round(m.progress * 28)))
          }
        })
      } catch (e) {
        // OCR failure isn't fatal — colour + metadata are still useful.
        console.warn('OCR failed', e)
      }
      setProgress(95)

      const dataUrl = toDataUrl(img, 800, 'image/jpeg', 0.85)
      setResult({ palette, meta, ocr, dataUrl })
      setProgress(100)
      setStage('Done')
      notice.success('Scan complete')
    } catch (e) {
      setError(e.message || 'Scan failed')
      notice.error(e.message || 'Scan failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const suggested = useMemo(() => {
    if (!result) return null
    const state = paletteToEditorState(result.palette, result.meta)
    const payload = derivePayload(result.ocr, result.meta, result.palette)
    return { state, payload }
  }, [result])

  const suggestedQrCanvas = useMemo(() => {
    if (!suggested?.state) return null
    return renderQrToCanvas(suggested.payload, suggested.state, 320)
  }, [suggested])

  // Mount the suggested QR canvas into a preview div (React can't render a
  // detached <canvas> as JSX, but we can slot it into a ref-held container).
  const previewRef = useRef(null)
  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.innerHTML = ''
    if (suggestedQrCanvas) {
      suggestedQrCanvas.className = 'w-full h-auto rounded-lg'
      previewRef.current.appendChild(suggestedQrCanvas)
    }
  }, [suggestedQrCanvas])

  const applySuggested = () => {
    if (!suggested?.state) return
    onApplyStyle?.(suggested.state, { payload: suggested.payload })
    notice.success('Style + payload pushed to editor')
  }

  const copyLine = (line) => {
    try {
      navigator.clipboard.writeText(line)
      notice.success('Copied')
    } catch { notice.error('Clipboard blocked') }
  }

  const downloadSuggestedPng = () => {
    if (!suggestedQrCanvas) return
    const a = document.createElement('a')
    a.href = suggestedQrCanvas.toDataURL('image/png')
    a.download = `vision-qr-${Date.now()}.png`
    a.click()
  }

  // ─── Batch mode ─────────────────────────────────────────────────────
  const runBatch = async () => {
    if (!batchFiles.length) { notice.warning('Drop some images first'); return }
    setBatchRunning(true); setBatchProgress(0)
    try {
      const entries = []
      let idx = 0
      for (const f of batchFiles) {
        idx++
        setBatchProgress(Math.round(((idx - 1) / batchFiles.length) * 100))
        const img = await loadImage(f)
        const colorBuf = toImageData(img, 64)
        const analysisBuf = toImageData(img, 512)
        const palette = extractDominantColors(colorBuf, 6)
        const meta = imageMetadata(analysisBuf)
        let ocr = { text: '', lines: [] }
        try {
          ocr = await runOcr(f)
        } catch {}
        const state = paletteToEditorState(palette, meta)
        const payload = derivePayload(ocr, meta, palette)
        const canvas = renderQrToCanvas(payload, state, 640)
        const dataUrl = canvas.toDataURL('image/png')
        const bytes = dataUrlToBytes(dataUrl)
        const safeName = (f.name || `img-${idx}`).replace(/[^a-z0-9._-]/gi, '_')
        entries.push({ name: `${idx.toString().padStart(2, '0')}_${safeName}.qr.png`, data: bytes })

        // Also drop a small JSON with the extracted metadata for the user.
        const summary = {
          source: f.name,
          payload,
          palette: palette.map((c) => ({ hex: c.hex, weight: c.weight })),
          meta,
          ocrTop: (ocr.lines || []).slice(0, 5),
        }
        const jsonBytes = new TextEncoder().encode(JSON.stringify(summary, null, 2))
        entries.push({ name: `${idx.toString().padStart(2, '0')}_${safeName}.json`, data: jsonBytes })
      }
      setBatchProgress(100)
      const blob = writeZip(entries)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `vision-qr-batch-${Date.now()}.zip`
      a.click()
      notice.success(`ZIP ready — ${batchFiles.length} image${batchFiles.length === 1 ? '' : 's'}`)
    } catch (e) {
      notice.error(e.message || 'Batch failed')
    } finally {
      setBatchRunning(false)
    }
  }

  const removeBatchFile = (f) => setBatchFiles((prev) => prev.filter((x) => x !== f))
  const clearBatch = () => setBatchFiles([])

  return (
    <div className='space-y-4'>
      {/* Intro / privacy note */}
      <div className='luxe-glass p-4 border border-emerald-400/20 bg-emerald-400/[0.03]'>
        <div className='flex items-start gap-3'>
          <InfoCircleOutlined className='text-emerald-300 text-lg mt-0.5' />
          <div>
            <div className='font-bold text-sm text-emerald-200'>Fully offline vision</div>
            <FieldHelp>
              Everything below runs in your browser. OCR uses Tesseract.js (lazy-loaded ~4 MB the first time), colour extraction uses a hand-rolled k-means on a 64×64 downsample, and metadata comes from a single loop over the image data. No pixel leaves the device.
            </FieldHelp>
          </div>
        </div>
      </div>

      {/* Upload / camera row */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center gap-2 mb-3'>
          <h2 className='font-bold text-lg'>1. Bring an image</h2>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <div className='md:col-span-2'>
            {cameraOn ? (
              <div className='rounded-lg border border-white/10 bg-black/60 overflow-hidden aspect-video flex items-center justify-center'>
                <video ref={videoRef} autoPlay playsInline muted className='w-full h-full object-cover' />
              </div>
            ) : (
              <Upload.Dragger {...uploadProps} className='!bg-white/[0.02] !border-white/10'>
                <p className='ant-upload-drag-icon'>
                  <InboxOutlined style={{ color: '#fbbf24' }} />
                </p>
                <p className='ant-upload-text !text-fg-primary font-bold'>
                  Drop, click, or paste. Anything visual.
                </p>
                <p className='ant-upload-hint !text-fg-muted'>
                  JPEG / PNG / WebP · everything runs client-side.
                </p>
              </Upload.Dragger>
            )}
            <div className='flex flex-wrap gap-2 mt-3'>
              {!cameraOn ? (
                <Button variant='ghost' icon={<CameraOutlined />} onClick={startCamera}>
                  Use camera
                </Button>
              ) : (
                <>
                  <Button variant='primary' icon={<CameraOutlined />} onClick={captureFromCamera}>
                    Snap
                  </Button>
                  <Button variant='ghost' onClick={stopCamera}>Cancel</Button>
                </>
              )}
              {preview && (
                <Button
                  variant='ghost'
                  icon={<ReloadOutlined />}
                  onClick={() => { setFile(null); setPreview(''); setResult(null); setError('') }}>
                  Clear
                </Button>
              )}
            </div>
            <FieldHelp>Tip: press Ctrl/Cmd + V anywhere on this tab to paste a screenshot.</FieldHelp>
          </div>

          <div className='flex flex-col gap-3'>
            <div className='rounded-lg border border-white/10 bg-black/30 overflow-hidden aspect-square flex items-center justify-center'>
              {preview
                ? <img src={preview} alt='Vision preview' className='w-full h-full object-cover' />
                : <div className='text-fg-muted text-sm text-center px-4'>
                    <PictureOutlined className='text-2xl mb-2 block' />
                    Preview appears here.
                  </div>}
            </div>
            <Button
              variant='primary'
              icon={<ThunderboltFilled />}
              loading={analyzing}
              disabled={!file}
              onClick={runScan}
              block>
              {analyzing ? 'Scanning…' : 'Scan image'}
            </Button>
            <FieldHelp>
              Colours + metadata are instant. OCR takes 2–8 s and lazy-loads the recogniser on first use.
            </FieldHelp>
          </div>
        </div>

        {analyzing && (
          <div className='mt-4'>
            <div className='flex items-center justify-between text-[11px] text-fg-muted mb-1'>
              <span>{stage}</span>
              <span>{progress}%</span>
            </div>
            <Progress percent={progress} showInfo={false} strokeColor={{ from: '#fbbf24', to: '#e879f9' }} />
          </div>
        )}

        {error && (
          <div className='mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm'>
            <CloseCircleOutlined className='text-rose-300 mr-2' />
            {error}
          </div>
        )}
      </div>

      {/* Result panel */}
      <AnimatePresence>
        {result && (
          <motion.div
            key='result'
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className='luxe-glass p-5'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='font-bold text-lg'>2. What we saw</h2>
              <div className='text-[11px] text-fg-muted'>
                {result.meta?.width}×{result.meta?.height} · {result.meta?.orientation}
              </div>
            </div>

            {/* Palette */}
            <div className='mb-5'>
              <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Dominant palette</div>
              <div className='flex flex-wrap gap-3'>
                {result.palette.map((c, i) => (
                  <div key={i} className='flex flex-col items-center gap-1'>
                    <button
                      type='button'
                      onClick={() => copyLine(c.hex)}
                      className='w-14 h-14 rounded-full shadow-inner ring-1 ring-white/20 hover:ring-amber-300/60 transition'
                      style={{ background: c.hex }}
                      title={`${c.hex} · ${Math.round(c.weight * 100)}%`}
                    />
                    <span className='font-mono text-[10px] text-fg-muted uppercase'>{c.hex}</span>
                    <span className='text-[10px] text-fg-muted'>{Math.round(c.weight * 100)}%</span>
                  </div>
                ))}
              </div>
              <FieldHelp>Click a swatch to copy its hex. Weights sum to 1.0 — the top two drive the QR gradient.</FieldHelp>
            </div>

            {/* Metadata tiles */}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-2 mb-5'>
              <MetaTile label='Brightness' value={pct(result.meta?.brightness)} />
              <MetaTile label='Contrast'   value={pct(result.meta?.contrast)} />
              <MetaTile label='Saturation' value={pct(result.meta?.saturation)} />
              <MetaTile label='Busyness'   value={pct(result.meta?.textureBusy)} />
            </div>

            {/* OCR */}
            <div className='mb-5'>
              <div className='flex items-center justify-between mb-2'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold'>
                  Extracted text {result.ocr?.confidence != null && (
                    <span className='ml-2 text-fg-muted normal-case'>
                      confidence {Math.round(result.ocr.confidence * 100)}%
                    </span>
                  )}
                </div>
                {result.ocr?.text && (
                  <Button size='small' variant='ghost' icon={<CopyOutlined />} onClick={() => copyLine(result.ocr.text)}>
                    Copy all
                  </Button>
                )}
              </div>
              {result.ocr?.lines?.length ? (
                <div className='rounded-lg border border-white/10 bg-black/30 divide-y divide-white/5 max-h-56 overflow-y-auto'>
                  {result.ocr.lines.map((line, i) => (
                    <div key={i} className='flex items-center gap-2 px-3 py-2 text-sm'>
                      <span className='flex-1 font-mono text-[12px] truncate' title={line}>{line}</span>
                      <button
                        type='button'
                        onClick={() => copyLine(line)}
                        className='text-fg-muted hover:text-amber-300 transition'
                        title='Copy line'>
                        <CopyOutlined />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='text-sm text-fg-muted italic'>No text detected — palette + metadata still drive the QR below.</div>
              )}
              <FieldHelp>OCR uses Tesseract.js in-browser. Best on high-contrast prints. First run downloads the English model.</FieldHelp>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggested QR */}
      <AnimatePresence>
        {suggested && (
          <motion.div
            key='suggested'
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className='luxe-glass p-5'>
            <div className='flex items-center gap-2 mb-3'>
              <h2 className='font-bold text-lg'>3. Suggested QR</h2>
              <Tag color='gold' className='!rounded-full'>auto</Tag>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
              {/* Preview */}
              <div>
                <div className='rounded-xl bg-white/95 p-3'>
                  <div ref={previewRef} className='mx-auto max-w-[280px]' />
                </div>
                <FieldHelp>Rendered with the exact style below — same paint path used by the 2D Editor once you apply it.</FieldHelp>
              </div>

              {/* Config summary */}
              <div className='space-y-3'>
                <div>
                  <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-1'>Payload</div>
                  <div className='rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[12px] break-all'>
                    {suggested.payload}
                  </div>
                  <FieldHelp>Extracted OCR text (top ~200 chars), or a compact vision summary when the image is text-free.</FieldHelp>
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <StyleChip label='Cell' value={suggested.state.cellShape} />
                  <StyleChip label='Eye'  value={suggested.state.eyeShape} />
                  <StyleChip label='ECC'  value={suggested.state.ecc} />
                  <StyleChip label='Angle' value={`${suggested.state.gradientAngle}°`} />
                </div>
                <div className='flex items-center gap-3'>
                  <div className='flex flex-col items-center'>
                    <span className='w-8 h-8 rounded-full ring-1 ring-white/20' style={{ background: suggested.state.fgColor }} />
                    <span className='font-mono text-[10px] text-fg-muted mt-1'>{suggested.state.fgColor}</span>
                  </div>
                  <span className='text-fg-muted'>→</span>
                  <div className='flex flex-col items-center'>
                    <span className='w-8 h-8 rounded-full ring-1 ring-white/20' style={{ background: suggested.state.fgColor2 }} />
                    <span className='font-mono text-[10px] text-fg-muted mt-1'>{suggested.state.fgColor2}</span>
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button variant='primary' icon={<CheckCircleFilled />} onClick={applySuggested}>
                    Use this style
                  </Button>
                  <Button variant='ghost' icon={<DownloadOutlined />} onClick={downloadSuggestedPng}>
                    Download PNG
                  </Button>
                </div>
                <FieldHelp>"Use this style" pushes cell + eye shapes, both gradient stops, angle, and ECC into the 2D Editor and swaps to that tab.</FieldHelp>
              </div>
            </div>

            {/* Raw JSON */}
            <details className='mt-5'>
              <summary className='cursor-pointer text-[11px] text-fg-muted hover:text-amber-300 select-none'>
                Raw extraction JSON
              </summary>
              <pre className='mt-2 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] overflow-x-auto max-h-64'>
{JSON.stringify({ meta: result.meta, palette: result.palette, ocr: result.ocr, suggested }, null, 2)}
              </pre>
            </details>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch mode */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center gap-2 mb-3'>
          <h2 className='font-bold text-lg'>4. Batch mode</h2>
          <Tag color='purple' className='!rounded-full'>bonus</Tag>
        </div>
        <FieldHelp>Drop up to 20 images. Each is scanned offline and rendered as a QR encoding its palette + top OCR text. You get a ZIP of PNGs + JSON summaries.</FieldHelp>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-3'>
          <div className='md:col-span-2'>
            <Upload.Dragger {...batchUploadProps} disabled={batchRunning}
              className='!bg-white/[0.02] !border-white/10'>
              <p className='ant-upload-drag-icon'>
                <FileZipOutlined style={{ color: '#a78bfa' }} />
              </p>
              <p className='ant-upload-text !text-fg-primary font-bold'>
                Drop many images. Get one ZIP.
              </p>
              <p className='ant-upload-hint !text-fg-muted'>
                Up to 20 · same pipeline as the single-image flow.
              </p>
            </Upload.Dragger>
          </div>
          <div className='flex flex-col gap-3'>
            <div className='rounded-lg border border-white/10 bg-black/30 p-3 min-h-[120px] max-h-[220px] overflow-y-auto text-[12px]'>
              {batchFiles.length
                ? batchFiles.map((f, i) => (
                    <div key={i} className='flex items-center justify-between gap-2 py-1'>
                      <span className='truncate' title={f.name}>{f.name}</span>
                      <button
                        type='button'
                        className='text-fg-muted hover:text-rose-300 transition text-[11px]'
                        disabled={batchRunning}
                        onClick={() => removeBatchFile(f)}>
                        remove
                      </button>
                    </div>
                  ))
                : <div className='text-fg-muted text-center py-6'>Queue is empty.</div>}
            </div>
            <div className='flex gap-2'>
              <Button
                variant='primary'
                icon={<FileZipOutlined />}
                loading={batchRunning}
                disabled={!batchFiles.length}
                onClick={runBatch}
                block>
                {batchRunning ? `Working ${batchProgress}%` : `Zip ${batchFiles.length || ''}`}
              </Button>
              <Button variant='ghost' disabled={!batchFiles.length || batchRunning} onClick={clearBatch}>
                Clear
              </Button>
            </div>
          </div>
        </div>

        {batchRunning && (
          <div className='mt-3'>
            <Progress percent={batchProgress} showInfo={false} strokeColor={{ from: '#a78bfa', to: '#e879f9' }} />
          </div>
        )}
      </div>
    </div>
  )
}

function MetaTile({ label, value }) {
  return (
    <div className='luxe-glass-soft p-3 text-center'>
      <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold'>{label}</div>
      <div className='text-sm font-bold text-amber-200 mt-1'>{value}</div>
    </div>
  )
}

function StyleChip({ label, value }) {
  return (
    <div className='rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2'>
      <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold'>{label}</div>
      <div className='text-sm font-bold text-fg-primary mt-0.5'>{value}</div>
    </div>
  )
}

function pct(v) {
  if (v == null) return '—'
  return `${Math.round(v * 100)}%`
}
