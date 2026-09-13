// VisionStudio — fourth top-level tab on /qr.
//
// Drop / capture / paste an image → the BE runs a deep vision pass and
// hands back caption, semantic tags, subjects, OCR, palette, faces, depth,
// and aesthetic hints. We render a rich result card and let the user
// convert any of it into a QR (URL / text / vCard payload) styled from
// the extracted palette.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Tag } from 'antd'
import { Button } from '../ui'
import {
  InboxOutlined, ThunderboltFilled, CameraOutlined, PictureOutlined,
  CopyOutlined, DownloadOutlined, ReloadOutlined,
  CheckCircleFilled, CloseCircleOutlined, LinkOutlined, IdcardOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import qrcode from 'qrcode-generator'
import { loadImage, toDataUrl, paletteToEditorState } from '../../lib/imageAnalysis'
import { deepAnalyzeImage } from '../../api/vision'
import { notice } from '../../lib/notice'
import { LuxeLoader } from '../loaders'

function FieldHelp({ children }) {
  return <p className='text-[11px] text-fg-muted mt-1 leading-snug'>{children}</p>
}

// Render a QR onto a canvas using the supplied style. Stripped-down copy
// of QRCompiler's core paint path — we only need square / rounded cells
// for the suggested-QR preview.
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

  ctx.fillStyle = style.bgColor || '#ffffff'
  ctx.fillRect(0, 0, size, size)

  const margin = Math.round(size * 0.06)
  const cell = (size - margin * 2) / N

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

// Compose a vCard 3.0 payload from a caption / OCR line. Best-effort — we
// only look for an obvious "Name / Title / email / phone / url" split so
// scans of physical business cards yield a real contact.
function buildVCard({ caption, ocrLines = [] }) {
  const lines = [caption, ...ocrLines].filter(Boolean).map((l) => l.trim())
  const email = lines.find((l) => /^\S+@\S+\.\S+$/.test(l)) || ''
  const phone = lines.find((l) => /^[+()\d\s.-]{7,}$/.test(l)) || ''
  const url   = lines.find((l) => /^https?:\/\//i.test(l)) || ''
  // Name = first line that isn't email / phone / url. Fallback: caption.
  const name = lines.find((l) => l !== email && l !== phone && l !== url) || caption || 'Contact'

  const escape = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n')
  const parts = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escape(name)}`,
    email && `EMAIL;TYPE=INTERNET:${escape(email)}`,
    phone && `TEL;TYPE=CELL:${escape(phone)}`,
    url   && `URL:${escape(url)}`,
    'END:VCARD',
  ].filter(Boolean)
  return parts.join('\n')
}

// Cosmetic status ticker while the BE crunches. These messages loop on a
// timer — the BE runs everything atomically, this is purely UX filler so
// the user has something to read during the 3-8s wait.
const STATUS_MESSAGES = [
  'Understanding scene…',
  'Reading text…',
  'Extracting colours…',
  'Detecting subjects…',
  'Sizing up faces…',
  'Mapping depth…',
]

// Map BE HTTP status → friendly toast copy. Keeps error branches out of the
// render body.
function toastForError(err) {
  const status = err?.status
  if (status === 429) return 'Analysing too fast — try again in a minute'
  if (status === 503) return 'The analysis engine is warming up — try again in ~30s'
  if (status === 502) return 'Analysis is temporarily unavailable — try again in a moment'
  return err?.message || 'Analysis failed'
}

// ─── Main component ────────────────────────────────────────────────────
export default function VisionStudio({ onApplyStyle, currentPayload }) {
  const [file, setFile]           = useState(null)
  const [preview, setPreview]     = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [statusIdx, setStatusIdx] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [result, setResult]       = useState(null)   // full BE response
  const [error, setError]         = useState('')

  // What kind of QR payload to encode. Users can flip between:
  //   auto   — caption or top OCR line
  //   url    — top URL detected in OCR (or manual paste)
  //   vcard  — vCard synthesised from caption + OCR
  const [payloadMode, setPayloadMode] = useState('auto')
  const [manualUrl, setManualUrl]     = useState('')

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
    } catch {
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

  // While analyzing, rotate the status ticker + count elapsed seconds so
  // the UI stays alive without any real progress signal from the BE.
  useEffect(() => {
    if (!analyzing) { setStatusIdx(0); setElapsedSec(0); return }
    const start = Date.now()
    const tick = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length)
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1200)
    return () => clearInterval(tick)
  }, [analyzing])

  const runAnalyze = async () => {
    if (!file) { notice.warning('Drop or capture an image first'); return }
    setAnalyzing(true); setError(''); setResult(null)
    try {
      const data = await deepAnalyzeImage(file)
      // Attach a preview data URL so the render path doesn't need the
      // original File / blob.
      let dataUrl = preview
      try {
        const img = await loadImage(file)
        dataUrl = toDataUrl(img, 800, 'image/jpeg', 0.85)
      } catch {}
      setResult({ ...data, dataUrl })
      // Surface any BE-side warnings as an amber toast, non-fatal.
      if (Array.isArray(data.warnings) && data.warnings.length) {
        notice.warning(data.warnings.join(' · '))
      } else {
        notice.success('Analysis complete')
      }
    } catch (e) {
      const msg = toastForError(e)
      setError(msg)
      notice.error(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  // Derive the QR payload based on the user's mode toggle.
  const derivedPayload = useMemo(() => {
    if (!result) return ''
    const caption = (result.caption || '').trim()
    const ocrLines = Array.isArray(result.ocr?.lines) ? result.ocr.lines : []
    const ocrText  = (result.ocr?.text || '').replace(/\s+/g, ' ').trim()
    if (payloadMode === 'url') {
      if (manualUrl.trim()) return manualUrl.trim()
      const url = ocrLines.find((l) => /^https?:\/\//i.test(l))
      return url || caption || 'https://siddharthfulia.com/qr'
    }
    if (payloadMode === 'vcard') {
      return buildVCard({ caption, ocrLines })
    }
    // auto: caption preferred, else top OCR line, else short summary.
    if (caption) {
      return caption.length > 200 ? caption.slice(0, 197) + '…' : caption
    }
    if (ocrText.length > 8) {
      return ocrText.length > 200 ? ocrText.slice(0, 197) + '…' : ocrText
    }
    const colours = (result.palette || []).slice(0, 3).map((c) => c.hex).join(',')
    return `vision:${colours}`
  }, [result, payloadMode, manualUrl])

  const suggested = useMemo(() => {
    if (!result) return null
    const state = paletteToEditorState(result.palette, result.aesthetic || {})
    return { state, payload: derivedPayload }
  }, [result, derivedPayload])

  const suggestedQrCanvas = useMemo(() => {
    if (!suggested?.state) return null
    return renderQrToCanvas(suggested.payload, suggested.state, 320)
  }, [suggested])

  // Mount the suggested QR canvas into a preview div (React can't render a
  // detached <canvas> as JSX).
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
    // Push style + payload + the original image so the 2D editor can bake
    // the actual picture into the QR (halftone into ECC waste + centred
    // logo overlay). Both live-scan-test-friendly modes handled parent-side.
    onApplyStyle?.(suggested.state, {
      payload: suggested.payload,
      image: preview || null,       // data URL — parent wires it into logoImg + bakeImg
    })
    notice.success('Style, payload, and image pushed to editor')
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

  return (
    <div className='space-y-4'>
      {/* Intro */}
      <div className='luxe-glass p-4 border border-fuchsia-400/20 bg-fuchsia-400/[0.03]'>
        <div className='flex items-start gap-3'>
          <ThunderboltFilled className='text-fuchsia-300 text-lg mt-0.5' />
          <div>
            <div className='font-bold text-sm text-fuchsia-200'>Deep vision analysis</div>
            <FieldHelp>
              Caption, palette, text, and semantic tags for any image.
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
                  JPEG / PNG / WebP · up to 8 MB.
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
              disabled={!file || analyzing}
              onClick={runAnalyze}
              block>
              {analyzing ? 'Analysing…' : 'Analyse'}
            </Button>
            <FieldHelp>
              One click to caption, colour-sample, read text, and detect subjects in the image.
            </FieldHelp>
          </div>
        </div>

        {/* Progressive loader */}
        {analyzing && (
          <div className='mt-4 rounded-xl border border-white/10 bg-black/30 p-5 flex flex-col items-center gap-3'>
            <LuxeLoader variant='cosmos' size='md' />
            <div className='text-center'>
              <div className='font-bold text-fuchsia-200 text-sm'>{STATUS_MESSAGES[statusIdx]}</div>
              {elapsedSec >= 2 && (
                <FieldHelp>This usually takes 3–5 seconds.</FieldHelp>
              )}
            </div>
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
              {result.elapsedMs != null && (
                <div className='text-[11px] text-fg-muted'>{(result.elapsedMs / 1000).toFixed(1)}s</div>
              )}
            </div>

            {/* Warnings (soft, amber, non-blocking) */}
            {Array.isArray(result.warnings) && result.warnings.length > 0 && (
              <div className='flex flex-wrap gap-2 mb-4'>
                {result.warnings.map((w, i) => (
                  <span
                    key={i}
                    className='px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-200 text-[11px]'>
                    {w}
                  </span>
                ))}
              </div>
            )}

            {/* Caption */}
            {result.caption && (
              <div className='mb-5'>
                <div className='text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1'>Caption</div>
                <div className='text-xl md:text-2xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent leading-tight'>
                  {result.caption}
                </div>
              </div>
            )}

            {/* Semantic tags */}
            {Array.isArray(result.tags) && result.tags.length > 0 && (
              <div className='mb-5'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Semantic tags</div>
                <div className='flex flex-col gap-1'>
                  {result.tags.slice(0, 5).map((t, i) => (
                    <TagBar key={i} label={t.label} score={t.score} />
                  ))}
                </div>
                <FieldHelp>Top matches ranked by confidence.</FieldHelp>
              </div>
            )}

            {/* Detected subjects */}
            {Array.isArray(result.subjects) && result.subjects.length > 0 && (
              <div className='mb-5'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Detected subjects</div>
                <div className='flex flex-wrap gap-1'>
                  {result.subjects.map((s, i) => (
                    <span
                      key={i}
                      className='px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[12px]'
                      title={s.score != null ? `${Math.round(s.score * 100)}%` : ''}>
                      {s.label}{s.score != null && (
                        <span className='ml-1 text-fg-muted'>{Math.round(s.score * 100)}%</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted text */}
            {Array.isArray(result.ocr?.lines) && result.ocr.lines.length > 0 && (
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
              </div>
            )}

            {/* Palette */}
            {Array.isArray(result.palette) && result.palette.length > 0 && (
              <div className='mb-5'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Dominant palette</div>
                <div className='flex flex-wrap gap-3'>
                  {result.palette.slice(0, 6).map((c, i) => (
                    <div key={i} className='flex flex-col items-center gap-1'>
                      <button
                        type='button'
                        onClick={() => copyLine(c.hex)}
                        className='w-14 h-14 rounded-full shadow-inner ring-1 ring-white/20 hover:ring-amber-300/60 transition'
                        style={{ background: c.hex }}
                        title={`${c.hex} · ${Math.round((c.weight || 0) * 100)}%`}
                      />
                      <span className='font-mono text-[10px] text-fg-muted uppercase'>{c.hex}</span>
                      {c.weight != null && (
                        <span className='text-[10px] text-fg-muted'>{Math.round(c.weight * 100)}%</span>
                      )}
                    </div>
                  ))}
                </div>
                <FieldHelp>Click a swatch to copy its hex. The top two drive the QR gradient below.</FieldHelp>
              </div>
            )}

            {/* Face insights */}
            {result.faces && result.faces.count > 0 && (
              <div className='mb-5'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>
                  Face insights <span className='ml-2 text-fg-muted normal-case'>{result.faces.count} detected</span>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2'>
                  {(result.faces.items || []).slice(0, 6).map((f, i) => (
                    <div key={i} className='luxe-glass-soft p-3 flex items-center gap-3'>
                      <div className='w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-amber-400/30 border border-white/10 flex items-center justify-center font-bold text-sm'>
                        {i + 1}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='text-sm font-bold capitalize'>{f.emotion || 'neutral'}</div>
                        <div className='text-[11px] text-fg-muted'>
                          {[f.gender, f.age != null ? `~${Math.round(f.age)} yrs` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Depth preview */}
            {result.depth?.dataUrl && (
              <div className='mb-5'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Depth</div>
                <div className='rounded-lg overflow-hidden border border-white/10 bg-black/30 inline-block'>
                  <img src={result.depth.dataUrl} alt='Depth map' className='max-w-[240px] max-h-[240px] object-contain' />
                </div>
                <FieldHelp>Brighter areas are closer to the camera.</FieldHelp>
              </div>
            )}

            {/* Aesthetic pills */}
            {result.aesthetic && (
              <div className='mb-2'>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Aesthetic</div>
                <div className='flex flex-wrap gap-2'>
                  {result.aesthetic.warmth != null && (
                    <AestheticPill label={result.aesthetic.warmth > 0.5 ? 'warm' : 'cool'} />
                  )}
                  {result.aesthetic.brightness != null && (
                    <AestheticPill label={result.aesthetic.brightness > 0.5 ? 'bright' : 'dim'} />
                  )}
                  {result.aesthetic.saturation != null && (
                    <AestheticPill label={result.aesthetic.saturation > 0.5 ? 'high saturation' : 'low saturation'} />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggested QR — only when we actually derived a style + payload.
          `suggested.state` can be null when the palette came back empty
          (e.g. all-black photos) — in that case we skip the whole card. */}
      <AnimatePresence>
        {suggested?.state && (
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

            {/* Payload mode toggle */}
            <div className='flex flex-wrap gap-2 mb-4'>
              <PayloadModeButton
                active={payloadMode === 'auto'}
                onClick={() => setPayloadMode('auto')}
                icon={<ThunderboltFilled />}
                label='Auto'
              />
              <PayloadModeButton
                active={payloadMode === 'url'}
                onClick={() => setPayloadMode('url')}
                icon={<LinkOutlined />}
                label='Encode as URL'
              />
              <PayloadModeButton
                active={payloadMode === 'vcard'}
                onClick={() => setPayloadMode('vcard')}
                icon={<IdcardOutlined />}
                label='Encode as vCard'
              />
            </div>

            {/* Manual URL input when the mode is URL */}
            {payloadMode === 'url' && (
              <div className='mb-4'>
                <input
                  type='url'
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder='https://…  (leave blank to use a URL detected in the image)'
                  className='w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-amber-300/60 transition'
                />
                <FieldHelp>Falls back to the first URL found in the image text.</FieldHelp>
              </div>
            )}

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
                  <div className='rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[12px] break-all max-h-32 overflow-y-auto'>
                    {suggested.payload}
                  </div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function TagBar({ label, score = 0 }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)))
  return (
    <div className='flex items-center gap-3'>
      <span className='text-sm font-bold capitalize min-w-[7rem] truncate' title={label}>{label}</span>
      <div className='flex-1 h-2 rounded-full bg-white/5 overflow-hidden'>
        <div
          className='h-full bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400'
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='font-mono text-[11px] text-fg-muted min-w-[2.5rem] text-right'>{pct}%</span>
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

function AestheticPill({ label }) {
  return (
    <span className='px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[12px] capitalize'>
      {label}
    </span>
  )
}

function PayloadModeButton({ active, onClick, icon, label }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold border transition ' +
        (active
          ? 'bg-gradient-to-r from-amber-400/20 to-fuchsia-400/20 border-amber-300/50 text-amber-100'
          : 'bg-white/[0.03] border-white/10 text-fg-muted hover:text-fg-primary hover:border-white/25')
      }>
      {icon}
      {label}
    </button>
  )
}
