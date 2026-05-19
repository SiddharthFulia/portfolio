import { useState, useRef, useEffect } from 'react'
import { Input, Button, Tooltip, Upload, message as antMessage } from 'antd'
import {
  SendOutlined, AudioOutlined, StopOutlined, LoadingOutlined,
  PictureOutlined, FileTextOutlined, CloseOutlined,
} from '@ant-design/icons'
import { fileToDataUrl, transcribeAudio } from '../api/ai'

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

export default function ChatInput({
  disabled = false, sending = false,
  placeholder = 'Message…',
  acceptsVision = false,
  onSubmit,
  onAttachmentsChange,        // ({ hasImage, hasDoc }) — lets parent react
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
        const reader = new FileReader()
        reader.onloadend = async () => {
          const { data, error: err } = await transcribeAudio({ dataUrl: reader.result })
          setRecState('idle')
          if (err) { antMessage.error(`Transcribe failed: ${err}`); return }
          const t = (data?.text || '').trim()
          if (!t) { antMessage.warning('Empty transcript — speak closer to the mic'); return }
          setText(prev => prev.trim() ? `${prev.trim()} ${t}` : t)
          taRef.current?.focus?.()
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
    } catch (e) { antMessage.error(`Mic error: ${e.message}`) }
  }

  const handleImage = async (file) => {
    if (!file) return false
    if (file.size > 8 * 1024 * 1024) {
      antMessage.error('Image too large (max 8 MB)')
      return false
    }
    try {
      const d = await fileToDataUrl(file)
      setImage({ dataUrl: d, name: file.name })
    } catch { antMessage.error('Could not read image') }
    return false
  }

  const handleDoc = async (file) => {
    if (!file) return false
    if (file.size > 4 * 1024 * 1024) {
      antMessage.error('Document too large (max 4 MB of plain text)')
      return false
    }
    const name = (file.name || '').toLowerCase()
    const extractable = /\.(txt|md|json|csv|log|html|xml|yaml|yml)$/i.test(name)
    if (!extractable) {
      antMessage.warning('Only text-based docs for now (.txt .md .json .csv .log .html .xml .yaml). PDF / Word support coming.')
      return false
    }
    try {
      const text = await file.text()
      setDoc({ name: file.name, text })
      antMessage.success(`Attached: ${file.name}`)
    } catch { antMessage.error('Could not read document') }
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
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 backdrop-blur-md p-2 shadow-lg shadow-black/50">
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

        {/* Image upload — only when vision model is active */}
        {acceptsVision && (
          <Tooltip title="Attach image (vision input)">
            <Upload accept="image/*" showUploadList={false} beforeUpload={handleImage}>
              <Button shape="circle" type="text" icon={<PictureOutlined />}
                disabled={recState !== 'idle' || sending} />
            </Upload>
          </Tooltip>
        )}

        {/* Document upload — any chat */}
        <Tooltip title="Attach a text document (.txt .md .json .csv …)">
          <Upload accept=".txt,.md,.json,.csv,.log,.html,.xml,.yaml,.yml" showUploadList={false}
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
