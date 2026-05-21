import { useState, useRef, useEffect } from 'react'
import { Input, Button, Tooltip, Upload, Dropdown } from 'antd'
import {
  SendOutlined, AudioOutlined, StopOutlined, LoadingOutlined,
  PictureOutlined, FileTextOutlined, CloseOutlined,
  BgColorsOutlined, CaretDownOutlined,
} from '@ant-design/icons'
import { fileToDataUrl, transcribeAudio } from '../api/ai'
import notify from '../utils/notify'

// Composer for AI Chat — textarea + mic + image upload + document upload.
//
// Props:
//   disabled       — submit disabled (no model selected, server offline, etc.)
//   sending        — true while a message is in flight; show spinner state
//   placeholder    — textarea placeholder
//   acceptsVision  — when true, image upload button is shown
//   onSubmit({ content, imageDataUrl, docName, docText })
//
// Mic flow: tap to start → tap to stop → transcribe via /api/stt → fill
// textarea. User can edit before sending.
//
// Document flow: PDF + .txt + .md + .json. PDFs are read as text via the
// browser File API; for .pdf, we just include the binary path. Better
// PDF parsing happens server-side in a future iteration. For MVP, we
// only support text-extractable formats (.txt / .md / .json / .csv).

// Curated image-gen models — kept in sync with the BE catalog. Keeping
// this list local means the chip dropdown is self-contained and doesn't
// need to round-trip to the BE on first render.
const IMAGE_GEN_MODELS = [
  { id: '@cf/black-forest-labs/flux-1-schnell',         label: 'Flux Schnell',     hint: '⚡ Fast' },
  { id: '@cf/bytedance/stable-diffusion-xl-lightning',  label: 'SDXL Lightning',   hint: 'Sharp · 5 steps' },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base',        hint: '🎨 Best detail' },
  { id: '@cf/lykon/dreamshaper-8-lcm',                  label: 'Dreamshaper',      hint: '✨ Stylized' },
]

export default function ChatInput({
  disabled = false, sending = false,
  placeholder = 'Message…',
  acceptsVision = false,
  onSubmit,
  onAttachmentsChange,        // ({ hasImage, hasDoc }) — lets parent react
  // Inline image-gen chip. When the parent wires these props, a small
  // 🎨 Image toggle appears in the input row. Pressing it flips the
  // per-conversation imageGenEnabled flag on the BE. Clicking the
  // caret next to it opens a model dropdown.
  imageGenEnabled = false,
  imageGenModel = null,
  onToggleImageGen,           // (next: boolean) — required if chip should appear
  onChangeImageGenModel,      // (modelId: string)
}) {
  const [text, setText] = useState('')
  const [image, setImage] = useState(null)   // { dataUrl, name }
  const [doc, setDoc] = useState(null)       // { name, text }
  const taRef = useRef(null)

  // Notify parent whenever an attachment is added / removed so it can
  // grey out non-vision models, show switch suggestions, etc.
  useEffect(() => {
    onAttachmentsChange?.({ hasImage: !!image, hasDoc: !!doc })
  }, [image, doc, onAttachmentsChange])

  // Mic / STT state
  const [recState, setRecState] = useState('idle')   // idle | recording | transcribing
  const [recElapsed, setRecElapsed] = useState(0)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const tickRef = useRef(null)
  const startedAtRef = useRef(0)

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop() } catch {}
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const stopRec = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop() } catch {}
    }
  }

  const handleMic = async () => {
    if (recState === 'recording') { stopRec(); return }
    if (recState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setRecState('transcribing')
        // Sticky toast while Whisper runs; swap to success/error on the
        // same key so the user sees one card transition cleanly.
        notify.loading('Whisper transcribing your voice…', { title: 'Transcribing', key: 'stt' })
        const reader = new FileReader()
        reader.onloadend = async () => {
          const { data, error: err } = await transcribeAudio({ dataUrl: reader.result })
          setRecState('idle')
          if (err) { notify.error(`Transcribe failed: ${err}`, { key: 'stt' }); return }
          const t = (data?.text || '').trim()
          if (!t) { notify.info('Empty transcript — speak closer to the mic', { key: 'stt' }); return }
          setText(prev => prev.trim() ? `${prev.trim()} ${t}` : t)
          taRef.current?.focus?.()
          notify.success(`Added ${t.length} chars to your message`, { title: 'Voice captured', key: 'stt' })
        }
        reader.readAsDataURL(blob)
      }
      recRef.current = mr
      mr.start(100)
      startedAtRef.current = Date.now()
      setRecElapsed(0); setRecState('recording')
      tickRef.current = setInterval(() => {
        const e = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setRecElapsed(e)
        if (e >= 60) stopRec()
      }, 250)
    } catch (e) { notify.error(`Mic error: ${e.message}`) }
  }

  const handleImage = async (file) => {
    if (!file) return false
    // 20 MB cap — phone photos can be ~10-15 MB at full quality; HEIC is
    // usually smaller. We give headroom for iPhone burst-mode shots.
    if (file.size > 20 * 1024 * 1024) {
      notify.error('Image too large (max 20 MB)')
      return false
    }
    // Sniff support: image/* MIME OR known phone extensions. Some
    // browsers report HEIC as application/octet-stream so we check the
    // file extension as a fallback.
    const name = (file.name || '').toLowerCase()
    const okMime = (file.type || '').startsWith('image/')
    const okExt = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tiff?|svg)$/i.test(name)
    if (!okMime && !okExt) {
      notify.info('Pick an image file (.jpg .jpeg .png .heic .heif .webp .gif etc.)')
      return false
    }
    try {
      const d = await fileToDataUrl(file)
      setImage({ dataUrl: d, name: file.name })
      notify.success(`${file.name} ready · ${(file.size / 1024 / 1024).toFixed(1)} MB`, { title: 'Image attached' })
    } catch { notify.error('Could not read image') }
    return false
  }

  const handleDoc = async (file) => {
    if (!file) return false
    if (file.size > 4 * 1024 * 1024) {
      notify.error('Document too large (max 4 MB of plain text)')
      return false
    }
    const name = (file.name || '').toLowerCase()
    // Widened: tsv + markdown variants + python/js/etc source files all
    // read fine as text. PDF / Word still need server-side extraction.
    const extractable = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|html|htm|xml|yaml|yml|ini|conf|cfg|sql|py|js|jsx|ts|tsx|sh|bash|zsh|go|rb|rs|java|c|cpp|h|hpp|cs|swift|kt|php|toml|env)$/i.test(name)
    if (!extractable) {
      notify.info('Text-based docs only for now (.txt .md .json .csv .log .html .xml .yaml .py .js .ts etc.). PDF / Word support coming.')
      return false
    }
    try {
      const text = await file.text()
      setDoc({ name: file.name, text })
      notify.success(`${file.name} attached · ${(text.length / 1024).toFixed(1)} KB`, { title: 'Document ready' })
    } catch { notify.error('Could not read document') }
    return false
  }

  const submit = () => {
    if (disabled || sending) return
    const content = text.trim()
    if (!content && !image && !doc) return
    onSubmit?.({
      content,
      imageDataUrl: image?.dataUrl || null,
      docName: doc?.name || null,
      docText: doc?.text || null,
    })
    setText(''); setImage(null); setDoc(null)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="luxe-card p-2">
      {/* Attachment chips */}
      {(image || doc) && (
        <div className="flex items-center gap-2 px-2 pb-2 flex-wrap">
          {image && (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[11px]">
              <img src={image.dataUrl} alt="" className="w-7 h-7 object-cover rounded" />
              <span className="text-cyan-200 truncate max-w-[140px]">{image.name}</span>
              <button onClick={() => setImage(null)} className="text-cyan-400 hover:text-rose-400">
                <CloseOutlined className="text-[10px]" />
              </button>
            </div>
          )}
          {doc && (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px]">
              <FileTextOutlined className="text-amber-300" />
              <span className="text-amber-200 truncate max-w-[160px]">{doc.name}</span>
              <span className="text-amber-300/60 font-mono">{(doc.text.length / 1024).toFixed(1)} KB</span>
              <button onClick={() => setDoc(null)} className="text-amber-400 hover:text-rose-400">
                <CloseOutlined className="text-[10px]" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Input.TextArea
          ref={taRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            recState === 'recording'    ? `🎙 Recording… ${recElapsed}s · tap mic again to stop`
            : recState === 'transcribing' ? 'Transcribing…'
            : disabled                    ? 'Select a model to start chatting'
            : placeholder
          }
          disabled={disabled || recState !== 'idle'}
          autoSize={{ minRows: 1, maxRows: 6 }}
          variant="borderless"
          className="flex-1"
        />

        {/* Image-gen chip — toggles per-conversation imageGenEnabled
            inline. When on, the model is allowed to emit a
            ```generate-image fence and the BE renders via the chosen
            Cloudflare model. The caret opens a small dropdown to swap
            models. Both halves come from the parent so the chip stays
            in sync with the Tune popover. */}
        {onToggleImageGen && (
          <div className={`hidden sm:inline-flex items-stretch overflow-hidden shrink-0 luxe-btn ${
            imageGenEnabled ? 'luxe-btn-primary' : 'luxe-btn-secondary'
          } !p-0 !rounded-full`}>
            <Tooltip title={imageGenEnabled
              ? `Image generation ON · ${IMAGE_GEN_MODELS.find(m => m.id === imageGenModel)?.label || 'Flux Schnell'}`
              : 'Click to let the chat draw images'}>
              <button
                type="button"
                onClick={() => onToggleImageGen(!imageGenEnabled)}
                disabled={disabled || sending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold">
                <BgColorsOutlined />
                <span>{imageGenEnabled
                  ? (IMAGE_GEN_MODELS.find(m => m.id === imageGenModel)?.label || 'Image')
                  : 'Image'
                }</span>
              </button>
            </Tooltip>
            {imageGenEnabled && (
              <Dropdown
                trigger={['click']}
                placement="topRight"
                menu={{
                  items: IMAGE_GEN_MODELS.map(m => ({
                    key: m.id,
                    label: (
                      <div className="leading-tight py-0.5 min-w-[180px]">
                        <div className="text-xs font-semibold">{m.label}</div>
                        <div className="text-[10px] text-gray-500">{m.hint}</div>
                      </div>
                    ),
                  })),
                  selectable: true,
                  selectedKeys: [imageGenModel || '@cf/black-forest-labs/flux-1-schnell'],
                  onClick: ({ key }) => onChangeImageGenModel?.(key),
                }}>
                <button type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="px-1.5 border-l border-fuchsia-500/30 text-fuchsia-200 hover:text-white text-[10px]">
                  <CaretDownOutlined />
                </button>
              </Dropdown>
            )}
          </div>
        )}

        {/* Image upload — only when vision model is active. accept= is
            wide on purpose: iPhone HEIC, Android JPEG, all standard
            web image types. Some Android pickers honour `capture` so
            the camera shortcut appears alongside the gallery. */}
        {acceptsVision && (
          <Tooltip title="Attach image (jpg · png · heic · webp · gif · …)">
            <Upload
              accept="image/*,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.bmp,.avif,.tif,.tiff"
              showUploadList={false}
              beforeUpload={handleImage}>
              <Button shape="circle" type="text" icon={<PictureOutlined />}
                disabled={recState !== 'idle' || sending} />
            </Upload>
          </Tooltip>
        )}

        {/* Document upload — any chat. Wider list so code files +
            config + tsv land too. */}
        <Tooltip title="Attach a text doc (.txt .md .json .csv .py .js .log …)">
          <Upload
            accept=".txt,.md,.markdown,.json,.jsonl,.csv,.tsv,.log,.html,.htm,.xml,.yaml,.yml,.ini,.conf,.cfg,.sql,.py,.js,.jsx,.ts,.tsx,.sh,.bash,.zsh,.go,.rb,.rs,.java,.c,.cpp,.h,.hpp,.cs,.swift,.kt,.php,.toml,.env"
            showUploadList={false}
            beforeUpload={handleDoc}>
            <Button shape="circle" type="text" icon={<FileTextOutlined />}
              disabled={recState !== 'idle' || sending} />
          </Upload>
        </Tooltip>

        {/* Mic — speak instead of typing */}
        <Tooltip title={
          recState === 'recording'    ? 'Stop recording'
          : recState === 'transcribing' ? 'Transcribing your speech…'
          : 'Speak instead of typing'
        }>
          <Button shape="circle"
            type={recState === 'recording' ? 'primary' : 'text'}
            danger={recState === 'recording'}
            icon={
              recState === 'recording'    ? <StopOutlined />
              : recState === 'transcribing' ? <LoadingOutlined spin />
              : <AudioOutlined />
            }
            onClick={handleMic}
            disabled={disabled || sending || recState === 'transcribing'} />
        </Tooltip>

        {/* Send */}
        <Button shape="circle" type="primary" icon={<SendOutlined />}
          onClick={submit}
          loading={sending}
          disabled={disabled || (!text.trim() && !image && !doc) || recState !== 'idle'}
          style={{ background: 'linear-gradient(135deg, #06b6d4, #7c3aed, #f59e0b)', border: 'none' }}
        />
      </div>
    </div>
  )
}
