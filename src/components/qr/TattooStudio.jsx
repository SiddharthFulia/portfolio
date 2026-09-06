// TattooStudio — third top-level tab on /qr.
//
// Flow:
//   1. User drops a tattoo photo into the antd Upload.Dragger.
//   2. FE previews the thumbnail, POSTs to /api/tattoo/analyze.
//   3. Gemini Vision returns { subject, style, motifs, dominant_colors,
//      line_weight, complexity, energy, suggested_qr_payload,
//      suggested_qr_style, confidence }.
//   4. FE renders a rich analysis card — big subject line, style badge,
//      motif chips, five colour swatches, three little stat tiles, and a
//      confidence bar.
//   5. "Apply suggested style" wires the BE's suggested_qr_style values
//      into the parent QRCompiler's editor state and switches back to the
//      2D Editor tab so the user immediately sees the live QR redraw.
//   6. "Use suggested payload" pre-fills the URL / text field with the
//      thematic payload the model suggested.
//   7. "Save this tattoo QR" hits /api/qr-saves with source_kind='tattoo'
//      and the full analysis as source_meta.
//   8. A gallery of past tattoo QRs sits below (server-filtered by
//      source_kind=tattoo).
//
// UX notes:
//   • Every panel title is bold (font-bold) with no leading em-dash.
//   • Every input surface has a helper caption underneath.
//   • Loading skeleton with a friendly "Reading the ink…" message.
//   • Framer Motion on the analysis card entry.
//   • Mobile: single column, upload zone full width.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Progress, Tag } from 'antd'
import { Button } from '../ui'
import {
  InboxOutlined, ExperimentOutlined, ThunderboltFilled,
  ReloadOutlined, DownloadOutlined, DeleteOutlined,
  CheckCircleFilled, CloseCircleFilled, InfoCircleOutlined,
  StarFilled, PictureOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { analyzeTattoo, checkTattooHealth } from '../../api/tattoo'
import { createQrSave, listQrSaves, deleteQrSave } from '../../api/qrSaves'
import { notice } from '../../lib/notice'

// FE-facing shape constants (mirror QRCompiler). Keep in sync manually if
// they ever change on the editor side.
const CELL_SHAPES = ['Square', 'Rounded', 'Dot', 'Diamond', 'Cross', 'Star']
const EYE_SHAPES  = ['Square', 'Rounded', 'Leaf', 'Circle']
const CELL_TO_FE  = { square: 'Square', rounded: 'Rounded', dot: 'Dot', diamond: 'Diamond' }
const EYE_TO_FE   = { square: 'Square', rounded: 'Rounded', leaf: 'Leaf', circle: 'Circle' }

// Small helper so the field captions read consistently with QRCompiler.
function FieldHelp({ children }) {
  return <p className='text-[11px] text-fg-muted mt-1 leading-snug'>{children}</p>
}

// Convert File → data URL for preview (small enough — the endpoint caps at
// 8 MB and we throw away the data URL as soon as we get the analysis back).
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// Turn the BE's `suggested_qr_style` (lowercase enums, hex codes) into the
// parent QRCompiler's setter shape. We return an object the parent can
// spread into its own applyStyle() function.
function toEditorState(analysis) {
  if (!analysis || !analysis.suggested_qr_style) return null
  const s = analysis.suggested_qr_style
  const cell = CELL_TO_FE[String(s.cell_shape || '').toLowerCase()] || 'Rounded'
  const eye  = EYE_TO_FE[String(s.eye_shape || '').toLowerCase()]  || 'Rounded'
  return {
    cellShape: cell,
    eyeShape: eye,
    eyeInnerShape: eye,
    fgColor: s.primary_color,
    fgColor2: s.secondary_color,
    gradientOn: true,
    gradientType: 'linear',
    gradientAngle: Math.max(0, Math.min(360, Number(s.gradient_direction) || 135)),
    ecc: s.ecc_level || 'H',
  }
}

// Small human-friendly relative-time formatter for gallery cards.
function relTime(ms) {
  if (!ms) return ''
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ms).toLocaleDateString()
}

export default function TattooStudio({ onApplyStyle, onUsePayload, currentPayload }) {
  const [file, setFile]           = useState(null)      // File / Blob from Upload
  const [preview, setPreview]     = useState('')        // data URL for thumbnail
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis]   = useState(null)      // Gemini response
  const [meta, setMeta]           = useState(null)      // { cached, elapsedMs, modelId }
  const [error, setError]         = useState('')
  const [usePayload, setUsePayload] = useState(true)
  const [saving, setSaving]       = useState(false)

  // Health probe — surfaces a friendly banner when Gemini isn't configured
  // on this BE, so users don't spend time uploading only to hit a 503.
  const [health, setHealth] = useState(null)
  useEffect(() => {
    checkTattooHealth().then(setHealth).catch(() => setHealth({ ok: false, unreachable: true }))
  }, [])

  // Gallery — filtered on the BE side by source_kind=tattoo. See
  // api/qrSaves.js + the qrSaves controller.
  const [gallery, setGallery] = useState([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const refreshGallery = async () => {
    setGalleryLoading(true); setGalleryError('')
    try {
      const data = await listQrSaves({ limit: 30, source_kind: 'tattoo' })
      setGallery(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      setGalleryError(e.message || 'Could not load gallery')
    } finally { setGalleryLoading(false) }
  }
  useEffect(() => { refreshGallery() }, [])

  // ─── Upload wiring ────────────────────────────────────────────
  const uploadProps = {
    name: 'image',
    multiple: false,
    accept: 'image/jpeg,image/png,image/webp',
    showUploadList: false,
    // beforeUpload:false suppresses antd's auto-POST; we do the fetch ourselves.
    beforeUpload: async (f) => {
      const maxBytes = 8 * 1024 * 1024
      if (f.size > maxBytes) {
        notice.error(`Image too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`)
        return false
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        notice.error('Only JPEG, PNG or WebP images are supported.')
        return false
      }
      setFile(f)
      setAnalysis(null)
      setMeta(null)
      setError('')
      try {
        const url = await fileToDataUrl(f)
        setPreview(url)
      } catch { setPreview('') }
      return false
    },
  }

  // ─── Analyze click ────────────────────────────────────────────
  const runAnalyze = async () => {
    if (!file) { notice.warning('Drop or pick a tattoo photo first'); return }
    setAnalyzing(true); setError('')
    try {
      const data = await analyzeTattoo(file)
      setAnalysis(data.analysis)
      setMeta({ cached: !!data.cached, elapsedMs: data.elapsedMs, modelId: data.modelId })
      if (data.cached) notice.info('Loaded from cache')
      else notice.success('Analysis complete')
    } catch (e) {
      setError(e.message || 'Analysis failed')
      notice.error(e.message || 'Analysis failed')
    } finally { setAnalyzing(false) }
  }

  // ─── Apply suggested style ───────────────────────────────────
  const applyStyle = () => {
    const state = toEditorState(analysis)
    if (!state) return
    onApplyStyle?.(state, {
      payload: usePayload ? analysis.suggested_qr_payload : null,
    })
    notice.success('Style pushed to editor')
  }

  // ─── Use suggested payload (without switching tabs) ──────────
  const usePayloadNow = () => {
    if (!analysis?.suggested_qr_payload) return
    onUsePayload?.(analysis.suggested_qr_payload)
    notice.success('Payload updated')
  }

  // ─── Save this tattoo QR ────────────────────────────────────
  const saveTattooQr = async () => {
    if (!analysis) return
    const payload = usePayload
      ? analysis.suggested_qr_payload
      : (currentPayload || analysis.suggested_qr_payload)
    if (!payload) { notice.warning('No payload to save'); return }
    setSaving(true)
    try {
      const styleState = toEditorState(analysis)
      const styleConfig = {
        ecc: styleState.ecc,
        cellShape: styleState.cellShape,
        eyeShape: styleState.eyeShape,
        eyeInnerShape: styleState.eyeInnerShape,
        fgColor: styleState.fgColor,
        fgColor2: styleState.fgColor2,
        gradientOn: styleState.gradientOn,
        gradientType: styleState.gradientType,
        gradientAngle: styleState.gradientAngle,
        bgColor: '#ffffff',
        gap: 0.08,
        radius: 60,
        payloadKind: 'URL',
        payload,
      }
      const title = `Tattoo · ${analysis.subject.slice(0, 60)}`
      const res = await createQrSave({
        title,
        payload,
        payload_kind: /^https?:\/\//i.test(payload) ? 'url' : 'text',
        style_config: styleConfig,
        png_data_url: null,             // baked previews live in the 2D editor
        public: true,
        source_kind: 'tattoo',
        source_meta: analysis,
      })
      const shareUrl = `${window.location.origin}/qr/s/${res.id}`
      notice.success('Saved. Share link copied.')
      try { await navigator.clipboard.writeText(shareUrl) } catch {}
      await refreshGallery()
    } catch (e) {
      notice.error(e.message || 'Could not save')
    } finally { setSaving(false) }
  }

  const deleteGalleryItem = async (id) => {
    try {
      await deleteQrSave(id)
      setGallery((prev) => prev.filter((g) => g.id !== id))
      notice.success('Deleted')
    } catch (e) { notice.error(e.message || 'Could not delete') }
  }

  const hasEditorState = useMemo(() => !!toEditorState(analysis), [analysis])
  const badgeHelper = health && !health.ok
    ? 'Gemini isn\'t configured on the current backend. Analyses will fail until GEMINI_ENABLED=1 + a valid GEMINI_API_KEY are set on the BE.'
    : ''

  return (
    <div className='space-y-4'>
      {/* Gemini-not-configured banner. Non-blocking — user can still upload
          + preview, they'll just hit a 503 on analyze. */}
      {health && !health.ok && (
        <div className='luxe-glass p-4 border border-amber-400/30 bg-amber-400/5'>
          <div className='flex items-start gap-3'>
            <InfoCircleOutlined className='text-amber-300 text-lg mt-0.5' />
            <div>
              <div className='font-bold text-sm text-amber-200'>Vision service not configured</div>
              <FieldHelp>{badgeHelper}</FieldHelp>
            </div>
          </div>
        </div>
      )}

      {/* Upload + Analyze */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center gap-2 mb-3'>
          <h2 className='font-bold text-lg'>1. Drop your tattoo</h2>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <div className='md:col-span-2'>
            <Upload.Dragger {...uploadProps} className='!bg-white/[0.02] !border-white/10'>
              <p className='ant-upload-drag-icon'>
                <InboxOutlined style={{ color: '#fbbf24' }} />
              </p>
              <p className='ant-upload-text !text-fg-primary font-bold'>
                Drop or click. Ink meets algorithm.
              </p>
              <p className='ant-upload-hint !text-fg-muted'>
                JPEG / PNG / WebP · max 8 MB · higher-res = better analysis.
              </p>
            </Upload.Dragger>
            <FieldHelp>
              Your photo is base64-encoded, sent once to Gemini Vision, cached by SHA-256 hash for 24 hours, then discarded. Nothing is written to disk.
            </FieldHelp>
          </div>

          <div className='flex flex-col gap-3'>
            <div className='rounded-lg border border-white/10 bg-black/30 overflow-hidden aspect-square flex items-center justify-center'>
              {preview
                ? <img src={preview} alt='Tattoo preview' className='w-full h-full object-cover' />
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
              onClick={runAnalyze}
              block>
              {analyzing ? 'Reading the ink…' : 'Analyze tattoo'}
            </Button>
            <FieldHelp>
              Uses Gemini Vision to identify subject, style, motifs, colors. Takes ~5 s. First run is a real call; retries within 24 h are cached and instant.
            </FieldHelp>
          </div>
        </div>

        {error && (
          <div className='mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm'>
            <CloseCircleFilled className='text-rose-300 mr-2' />
            {error}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {analyzing && (
        <div className='luxe-glass p-6'>
          <div className='flex items-center gap-3 mb-4'>
            <div className='w-8 h-8 rounded-full border-2 border-amber-300 border-t-transparent animate-spin' />
            <div>
              <div className='font-bold text-amber-200'>Reading the ink…</div>
              <FieldHelp>Identifying subject, style, motifs, palette, complexity.</FieldHelp>
            </div>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div className='h-20 rounded-lg bg-white/5 animate-pulse' />
            <div className='h-20 rounded-lg bg-white/5 animate-pulse' />
            <div className='h-14 rounded-lg bg-white/5 animate-pulse' />
            <div className='h-14 rounded-lg bg-white/5 animate-pulse' />
          </div>
        </div>
      )}

      {/* Analysis result */}
      <AnimatePresence>
        {analysis && !analyzing && (
          <motion.div
            key='analysis-card'
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className='luxe-glass p-5'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='font-bold text-lg'>2. Analysis</h2>
              <div className='flex items-center gap-2 text-[11px] text-fg-muted'>
                {meta?.cached && <span className='px-2 py-0.5 rounded-full bg-white/5'>cached</span>}
                {meta?.modelId && <span className='px-2 py-0.5 rounded-full bg-white/5'>{meta.modelId}</span>}
                {meta?.elapsedMs != null && <span>{(meta.elapsedMs / 1000).toFixed(1)}s</span>}
              </div>
            </div>

            {/* Subject */}
            <div className='mb-4'>
              <div className='text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1'>Subject</div>
              <div className='text-2xl md:text-3xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent leading-tight'>
                {analysis.subject}
              </div>
            </div>

            {/* Style + motifs */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
              <div>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Style</div>
                <Tag color='magenta' className='!text-sm !py-1 !px-3 !rounded-full'>
                  {analysis.style}
                </Tag>
                <FieldHelp>Broad tattoo-culture bucket. Drives the default cell + eye shape choice.</FieldHelp>
              </div>
              <div>
                <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Motifs</div>
                <div className='flex flex-wrap gap-1'>
                  {analysis.motifs.length
                    ? analysis.motifs.map((m, i) => (
                        <span key={i} className='px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[12px]'>
                          {m}
                        </span>
                      ))
                    : <span className='text-xs text-fg-muted'>None detected.</span>}
                </div>
                <FieldHelp>Key visual elements the model identified in the piece.</FieldHelp>
              </div>
            </div>

            {/* Dominant colors */}
            <div className='mb-4'>
              <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Dominant palette</div>
              <div className='flex flex-wrap gap-3'>
                {analysis.dominant_colors.map((c, i) => (
                  <div key={i} className='flex items-center gap-2'>
                    <div
                      className='w-10 h-10 rounded-full shadow-inner ring-1 ring-white/20'
                      style={{ background: c }}
                      title={c}
                    />
                    <span className='font-mono text-[11px] text-fg-muted uppercase'>{c}</span>
                  </div>
                ))}
              </div>
              <FieldHelp>Feeds the QR gradient (primary → secondary) and the swatch chips in the editor.</FieldHelp>
            </div>

            {/* Stats trio */}
            <div className='grid grid-cols-3 gap-2 mb-4'>
              <StatTile label='Line weight' value={analysis.line_weight} />
              <StatTile label='Complexity'  value={analysis.complexity} />
              <StatTile label='Energy'      value={analysis.energy} />
            </div>

            {/* Confidence bar */}
            <div className='mb-4'>
              <div className='flex items-center justify-between text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>
                <span>Model confidence</span>
                <span>{Math.round((analysis.confidence || 0) * 100)}%</span>
              </div>
              <Progress
                percent={Math.round((analysis.confidence || 0) * 100)}
                showInfo={false}
                strokeColor={{ from: '#fbbf24', to: '#e879f9' }}
              />
              <FieldHelp>How sure the model is about the classification. Low = the tattoo photo may be blurry, cropped, or off-style.</FieldHelp>
            </div>

            {/* Suggested payload */}
            <div className='mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3'>
              <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold mb-2'>Suggested payload</div>
              <div className='font-mono text-[12px] break-all text-fg-primary'>
                {analysis.suggested_qr_payload}
              </div>
              <FieldHelp>A short URL or text the model thinks fits the tattoo. Toggle below to use it when applying / saving.</FieldHelp>
              <label className='flex items-center gap-2 mt-3 text-sm cursor-pointer'>
                <input
                  type='checkbox'
                  checked={usePayload}
                  onChange={(e) => setUsePayload(e.target.checked)}
                  className='w-4 h-4 accent-amber-400'
                />
                Use suggested payload when applying / saving
              </label>
            </div>

            {/* Actions */}
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='primary'
                icon={<CheckCircleFilled />}
                disabled={!hasEditorState}
                onClick={applyStyle}>
                Apply suggested style
              </Button>
              <Button variant='ghost' onClick={usePayloadNow} disabled={!analysis.suggested_qr_payload}>
                Use suggested payload
              </Button>
              <Button variant='success' loading={saving} onClick={saveTattooQr}>
                Save this tattoo QR
              </Button>
            </div>
            <FieldHelp>
              Apply pushes cell shape, eye shape, primary + secondary colours, gradient angle, and ECC into the 2D Editor and switches you back so you see the live QR redraw.
            </FieldHelp>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center justify-between mb-3'>
          <div>
            <h2 className='font-bold text-lg'>3. Tattoo QR gallery</h2>
            <FieldHelp>Every tattoo QR you have saved from this browser. Filtered server-side by source_kind = tattoo.</FieldHelp>
          </div>
          <Button
            variant='ghost'
            icon={<ReloadOutlined />}
            loading={galleryLoading}
            onClick={refreshGallery}>
            Refresh
          </Button>
        </div>

        {galleryError && (
          <div className='text-sm text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3 py-2 mb-3'>
            {galleryError}
          </div>
        )}
        {!galleryLoading && !gallery.length && !galleryError && (
          <div className='text-sm text-fg-muted py-6 text-center'>
            Nothing saved yet. Analyze a tattoo above, then hit "Save this tattoo QR".
          </div>
        )}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {gallery.map((g) => (
            <div key={g.id} className='luxe-card p-3 flex flex-col gap-2'>
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <span className='text-[10px] uppercase tracking-widest text-fuchsia-300 font-bold'>Tattoo</span>
                  <div className='font-bold text-sm line-clamp-2 leading-tight' title={g.title || 'Untitled'}>
                    {g.title || 'Untitled'}
                  </div>
                </div>
                {g.hasPng && g.pngDataUrl && (
                  <img src={g.pngDataUrl} alt='' className='w-12 h-12 rounded object-cover bg-white shrink-0' />
                )}
              </div>
              {g.sourceMeta && (
                <>
                  <div className='text-[11px] text-fg-muted line-clamp-2'>
                    {g.sourceMeta.subject}
                  </div>
                  <div className='flex flex-wrap gap-1'>
                    {(g.sourceMeta.dominant_colors || []).slice(0, 5).map((c, i) => (
                      <span
                        key={i}
                        className='w-4 h-4 rounded-full ring-1 ring-white/20'
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </>
              )}
              <div className='font-mono text-[11px] break-all opacity-70 line-clamp-1'>
                {g.payload}
              </div>
              <div className='flex items-center justify-between text-[10px] text-fg-muted'>
                <span>{g.views} view{g.views === 1 ? '' : 's'}</span>
                <span>{relTime(g.createdAt)}</span>
              </div>
              <div className='pt-1 flex flex-wrap gap-1'>
                <a href={`/qr/s/${g.id}`} target='_blank' rel='noreferrer'>
                  <Button size='small' variant='ghost'>Open</Button>
                </a>
                <Button
                  size='small'
                  variant='danger'
                  icon={<DeleteOutlined />}
                  onClick={() => deleteGalleryItem(g.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div className='luxe-glass-soft p-3 text-center'>
      <div className='text-[10px] uppercase tracking-widest text-fg-muted font-bold'>{label}</div>
      <div className='text-sm font-bold text-amber-200 mt-1 capitalize'>{value || '—'}</div>
    </div>
  )
}
