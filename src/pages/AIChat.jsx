import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Select, Tag, Tooltip, Button, Popover, Slider, InputNumber, Modal, Switch } from 'antd'
import notify from '../utils/notify'
import ChatLogo from '../components/ChatLogo'
import {
  UserOutlined, CopyOutlined, CheckOutlined, MenuOutlined,
  ThunderboltOutlined, CloudOutlined, DesktopOutlined, GoogleOutlined,
  PictureOutlined, FileTextOutlined, SettingOutlined, MergeCellsOutlined,
  ExperimentOutlined, LockOutlined, CameraOutlined, AudioOutlined, BgColorsOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import ChatSidebar from '../components/ChatSidebar'
import ChatInput from '../components/ChatInput'
import DownloadMenu from '../components/DownloadMenu'
import MessageImage from '../components/MessageImage'
import AnimatedAIChat from '../components/luxe/AnimatedAIChat'
import {
  listLocalModels, createConversation, getConversation, sendChatMessage,
  getChatJobStatus, updateConversation,
  compactConversationApi, finalizeCompactApi,
} from '../api/ai'

// ─── Provider catalog ────────────────────────────────────────────────
// Tabs across the top of the chat. Each provider has a curated model
// list with a "best for X" hint so users don't have to guess. The 5090
// list is hydrated dynamically from `/api/chat/local-models`.

// id keys are stable for the BE; labels are visitor-facing. The local
// runtime gets a premium-sounding name — visitors should perceive it
// as a powerful feature, not "running on someone's PC".
// §76 — Gemini disabled (cost). cloud-gemini entry commented out so
// the provider switcher doesn't surface it. Restore the line + set
// GEMINI_ENABLED=1 in BE .env to re-enable.
const PROVIDERS = [
  { id: '5090',          label: 'Studio Pro',     icon: <ThunderboltOutlined />, blurb: 'Premium · private · multimodal',                      accent: 'bg-amber-500' },
  { id: 'cloud-groq',    label: 'Groq Cloud',     icon: <CloudOutlined />,      blurb: 'Hosted · sub-second tokens · Llama / GPT-OSS',         accent: 'bg-cyan-500' },
  // { id: 'cloud-gemini',  label: 'Gemini',         icon: <GoogleOutlined />,    blurb: 'Google · multimodal · fast + free tier',               accent: 'bg-cyan-500' },
  { id: 'oracle-ollama', label: 'Standby',        icon: <DesktopOutlined />,    blurb: 'Lightweight fallback when other lanes are busy',       accent: 'bg-emerald-500' },
]

const GROQ_MODELS = [
  { id: 'llama-3.1-8b',  name: 'Llama 3.1 8B',  best: 'Fastest replies' },
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', best: 'Best quality reasoning' },
  { id: 'gpt-oss-120b',  name: 'GPT-OSS 120B',  best: 'Most powerful, slowest' },
]
const GEMINI_MODELS = [
  { id: 'gemini-flash',      name: 'Gemini 2.0 Flash',      best: 'Fast multimodal' },
  { id: 'gemini-flash-lite', name: 'Gemini Flash Lite',     best: 'Ultra light' },
  { id: 'gemini-pro',        name: 'Gemini 1.5 Pro',        best: 'Long-context reasoning' },
]
const ORACLE_MODELS = [
  { id: 'phi3:mini',            name: 'Phi-3 Mini',     best: 'Small, general purpose' },
  { id: 'llama3.2:1b',          name: 'Llama 3.2 1B',   best: 'Fast tiny model' },
  { id: 'deepseek-coder:1.3b',  name: 'DeepSeek Coder', best: 'Code (tiny)' },
]

// One-liner "what to use for what" — drives the welcoming empty state.
const ROLE_HINTS = {
  'qwen2.5:32b-instruct-q4_K_M':       'Best open text · everyday reasoning',
  'qwen2.5:14b-instruct-q4_K_M':       'Faster everyday chat',
  'qwen2.5-coder:32b-instruct-q4_K_M': 'Best open code generator',
  'qwen2.5-coder:14b-instruct-q4_K_M': 'Faster code generation',
  'qwen2.5vl:32b':                      'Top vision · OCR, charts, screenshots',
  'qwen2.5vl:7b':                       'Vision · efficient',
  'llama3.2-vision:11b':                'Meta vision (alt)',
  'llama3.2-vision:90b':                'Top vision · slow',
  'phi4:14b':                           'Math + STEM punches above weight',
  'gemma2:27b-instruct-q4_K_M':         'Google Gemma · alt reasoning',
  'mistral-small:24b-instruct-q4_K_M':  'Mistral · function calling',
  'llama3.3:70b-instruct-q4_K_M':       'Llama 3.3 · smartest (slow)',
  'llava:34b-v1.6-q4_K_M':              'Classic vision · screenshots',
  'minicpm-v:8b':                       'Efficient vision · phone-class',
  'bge-m3':                              'Embeddings (not for chat)',
}

const isVisionModel = (id = '') => /vision|vl|llava|minicpm-v|bakllava/i.test(id)
const isCodeModel = (id = '') => /coder/i.test(id)
const isEmbeddingModel = (id = '') => /embed|bge-/i.test(id)

const fmtBytes = (b) => {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// ─── Markdown renderer (preserved from previous AIChat) ─────────────
const CodeBlock = ({ children, className }) => {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')
  const lang = className?.replace('language-', '') || ''
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative my-2 rounded-lg overflow-hidden border border-gray-700">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700">
        <span className="text-[10px] text-gray-500 font-mono">{lang || 'code'}</span>
        <button onClick={copy} className="text-gray-500 hover:text-white transition-colors">
          {copied ? <CheckOutlined style={{ fontSize: 12, color: '#4caf50' }} /> : <CopyOutlined style={{ fontSize: 12 }} />}
        </button>
      </div>
      <pre className="p-3 bg-gray-950 overflow-x-auto text-xs leading-relaxed"><code>{code}</code></pre>
    </div>
  )
}
const InlineCode = ({ children }) => (
  <code className="px-1.5 py-0.5 bg-gray-800 text-cyan-400 text-xs rounded font-mono">{children}</code>
)
const MarkdownMessage = ({ content }) => (
  <ReactMarkdown components={{
    code: ({ inline, className, children }) =>
      inline ? <InlineCode>{children}</InlineCode> : <CodeBlock className={className}>{children}</CodeBlock>,
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="text-sm">{children}</li>,
    h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
    strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
    em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-cyan-500 pl-3 my-2 text-gray-400 italic">{children}</blockquote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{children}</a>,
    table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full text-xs border border-gray-700">{children}</table></div>,
    th: ({ children }) => <th className="px-2 py-1 bg-gray-800 border border-gray-700 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="px-2 py-1 border border-gray-700">{children}</td>,
    hr: () => <hr className="my-3 border-gray-700" />,
  }}>{content}</ReactMarkdown>
)

// ─── Page ────────────────────────────────────────────────────────────
const AIChat = () => {
  const navigate = useNavigate()
  const { chatId } = useParams()

  const [provider, setProvider] = useState('5090')
  const [model, setModel] = useState('')
  const [localModels, setLocalModels] = useState([])
  const [localOnline, setLocalOnline] = useState(null)

  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [sidebarRefresh, setSidebarRefresh] = useState(0)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  // Tracks live attachment state from <ChatInput>. When the user has
  // an image staged but the selected model can't see images, we grey
  // out non-vision options + show a "switch to" suggestion banner.
  const [hasImageAttached, setHasImageAttached] = useState(false)
  // ⚙ Generation overrides. null = use model default. The popover shows
  // both controls; pressing "Use default" clears back to null.
  const [temperature, setTemperature] = useState(null)
  const [maxTokens, setMaxTokens] = useState(null)
  const [compacting, setCompacting] = useState(false)
  // Image generation per-conversation toggle + model. Off by default so
  // visitors don't burn Cloudflare quota on accidental "draw" matches.
  const [imageGenEnabled, setImageGenEnabled] = useState(false)
  const [imageGenModel, setImageGenModel] = useState(null)

  const pollRef = useRef(null)
  const scrollRef = useRef(null)
  // When the user submits from the AnimatedAIChat hero (no chatId yet)
  // we create a chat, navigate to it, then this ref carries the message
  // text so an effect fires the actual send once the new chat is open.
  const pendingInitialSendRef = useRef(null)

  useEffect(() => { document.title = chatId ? `Chat · ${chatId.slice(0,8)} · Sid` : 'AI Chat · Sid' }, [chatId])

  // Auto-scroll to bottom on new messages. Skip when there are zero
  // messages — otherwise the WelcomeHero (which is taller than the
  // visible scroll area) gets auto-scrolled past on first load and the
  // user lands at the bottom seeing nothing useful.
  useEffect(() => {
    if (!scrollRef.current) return
    if (messages.length === 0) {
      scrollRef.current.scrollTop = 0
      return
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  // Fetch installed 5090 Ollama models on mount + every 30s while on 5090 tab
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const { data } = await listLocalModels()
      if (cancelled) return
      const models = data?.models || []
      setLocalModels(models)
      setLocalOnline(!!data?.online)
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Load conversation when chatId changes
  useEffect(() => {
    if (!chatId) { setConversation(null); setMessages([]); return }
    let cancelled = false
    getConversation(chatId).then(({ data, error: err }) => {
      if (cancelled) return
      if (err || !data) {
        notify.error(err || 'Conversation not found')
        navigate('/ai')
        return
      }
      setConversation(data)
      setMessages(data.messages || [])
      if (data.provider) setProvider(data.provider)
      if (data.model) setModel(data.model)
      setTemperature(typeof data.temperature === 'number' ? data.temperature : null)
      setMaxTokens(Number.isInteger(data.maxTokens) ? data.maxTokens : null)
      setImageGenEnabled(!!data.imageGenEnabled)
      setImageGenModel(data.imageGenModel || null)
    })
    return () => { cancelled = true }
  }, [chatId, navigate])

  // Model list per provider
  const availableModels = useMemo(() => {
    if (provider === '5090') {
      return localModels
        .filter(m => !isEmbeddingModel(m.name))
        .map(m => ({
          id: m.name,
          name: m.name.replace(/-instruct-q4_K_M$/, '').replace(/:[\w-]+$/, m.name.match(/:[\w-]+$/)?.[0] || ''),
          best: ROLE_HINTS[m.name] || (isVisionModel(m.name) ? 'Vision' : isCodeModel(m.name) ? 'Code' : 'Chat'),
          size: m.size,
          isVision: isVisionModel(m.name),
          isCode: isCodeModel(m.name),
        }))
    }
    if (provider === 'cloud-groq') return GROQ_MODELS
    if (provider === 'cloud-gemini') return GEMINI_MODELS
    if (provider === 'oracle-ollama') return ORACLE_MODELS
    return []
  }, [provider, localModels])

  // Default model when provider changes or list arrives
  useEffect(() => {
    if (!availableModels.length) { setModel(''); return }
    if (model && availableModels.some(m => m.id === model)) return  // keep user's choice
    setModel(availableModels[0].id)
  }, [availableModels, model])

  const selectedModelMeta = availableModels.find(m => m.id === model)
  const acceptsVision = provider === '5090' ? !!selectedModelMeta?.isVision : provider === 'cloud-gemini'

  // New chat button — always starts on Studio Pro with the first
  // available local model. Users can switch provider/model per-message
  // afterwards, but new chats land on the premium lane by default.
  //
  // If `initialMessage` is provided (e.g. the user submitted from the
  // AnimatedAIChat hero) we stash it in a ref so an effect can dispatch
  // it once the new chatId is mounted.
  const handleNewChat = async (initialMessage) => {
    const startProvider = '5090'
    const firstLocal = localModels
      .filter(m => !isEmbeddingModel(m.name))[0]?.name || null
    // Switch the UI immediately so the model picker hydrates correctly
    setProvider(startProvider)
    if (firstLocal) setModel(firstLocal)
    const { data, error: err } = await createConversation({
      title: 'New chat',
      model: firstLocal,
      provider: startProvider,
    })
    if (err || !data?.chatId) {
      notify.error(err || 'Could not create chat')
      return
    }
    if (typeof initialMessage === 'string' && initialMessage.trim()) {
      pendingInitialSendRef.current = {
        chatId: data.chatId,
        content: initialMessage.trim(),
        model: firstLocal,
        provider: startProvider,
      }
    }
    setSidebarRefresh(n => n + 1)
    navigate(`/ai/${encodeURIComponent(data.chatId)}`)
  }

  // Persist any popover-controlled setting back to the conversation.
  // Supports temperature, maxTokens, imageGenEnabled, imageGenModel.
  // Pass `null` to clear back to model-default.
  const saveOverride = async (patchInput = {}) => {
    if (!chatId) return
    const patch = {}
    if ('temperature'      in patchInput) patch.temperature      = patchInput.temperature
    if ('maxTokens'        in patchInput) patch.maxTokens        = patchInput.maxTokens
    if ('imageGenEnabled'  in patchInput) patch.imageGenEnabled  = patchInput.imageGenEnabled ? 1 : 0
    if ('imageGenModel'    in patchInput) patch.imageGenModel    = patchInput.imageGenModel
    if (!Object.keys(patch).length) return
    const { error: err } = await updateConversation(chatId, patch)
    if (err) notify.error(err)
  }

  // Total chars in the live (non-compacted) conversation — drives the
  // "compact" button's helper text + lets the user decide when it's
  // worth running.
  const liveCharStats = useMemo(() => {
    const visible = messages.filter(m => !m._pending)
    const chars = visible.reduce((n, m) => n + (m.content ? m.content.length : 0), 0)
    return { count: visible.length, chars }
  }, [messages])

  // Polls a local compact job until it terminates, then finalizes.
  // Resolves on success; rejects on failure / timeout.
  const waitForCompactJob = (jobId, keepLastN) => new Promise((resolve, reject) => {
    let attempts = 0
    const id = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getChatJobStatus(jobId)
      if (err) {
        if (attempts > 5) { clearInterval(id); reject(new Error(err)) }
        return
      }
      if (!data) return
      if (data.status === 'completed') {
        clearInterval(id)
        const fin = await finalizeCompactApi(chatId, { jobId, keepLastN })
        if (fin.error) { reject(new Error(fin.error)); return }
        resolve(fin.data)
      } else if (data.status === 'failed') {
        clearInterval(id)
        reject(new Error(data.error || 'Compact job failed'))
      }
      if (attempts > 200) {  // ~5min @ 1.5s
        clearInterval(id)
        reject(new Error('Compact timed out — try again in a moment'))
      }
    }, 1500)
  })

  const onCompact = () => {
    if (!chatId) return
    if (liveCharStats.count <= 6) {
      notify.info('Chat is still short — nothing to compact yet')
      return
    }
    const willCompact = Math.max(0, liveCharStats.count - 4)
    Modal.confirm({
      title: <span className="text-white font-bold text-base">Compact this chat?</span>,
      icon: null,
      // Force the modal itself dark so all the light-on-dark text below
      // is readable. AntD's default white background eats white text.
      styles: {
        content: { background: 'var(--luxe-bg-base)', border: '1px solid var(--luxe-border)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)' },
        header:  { background: 'transparent', borderBottom: '1px solid rgba(55, 65, 81, 0.6)', paddingBottom: 12 },
        body:    { background: 'transparent', color: '#e5e7eb', paddingTop: 16 },
        footer:  { background: 'transparent', borderTop: '1px solid rgba(55, 65, 81, 0.6)', paddingTop: 12 },
        mask:    { background: 'rgba(0, 0, 0, 0.7)' },
      },
      content: (
        <div className="text-sm space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-amber-500/12 border border-amber-500/40">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Will compact</div>
              <div className="text-2xl font-black text-white leading-tight">{willCompact}</div>
              <div className="text-[10px] text-amber-200">older messages</div>
            </div>
            <div className="p-3 rounded-lg bg-cyan-500/15 border border-cyan-500/40">
              <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Will keep</div>
              <div className="text-2xl font-black text-white leading-tight">4</div>
              <div className="text-[10px] text-cyan-200">latest as-is</div>
            </div>
          </div>
          <p className="text-[13px] text-gray-100 leading-relaxed">
            Summarised into one system note so the model stays fast.
            Nothing is deleted — older messages are just hidden from the prompt.
          </p>
          <div className="text-[12px] text-emerald-100 bg-emerald-500/12 border border-emerald-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <LockOutlined className="text-base mt-0.5" />
            <span>
              Runs on your <span className="font-bold text-white">Studio Pro</span> when online —
              chat stays private. Falls back to cloud only if 5090 is offline.
            </span>
          </div>
        </div>
      ),
      okText: 'Compact',
      okButtonProps: {
        style: { background: '#f59e0b', border: 'none', fontWeight: 700 },
      },
      cancelText: 'Cancel',
      cancelButtonProps: {
        style: { background: 'transparent', borderColor: 'rgba(75, 85, 99, 0.6)', color: '#e5e7eb' },
      },
      centered: true,
      width: 460,
      onOk: async () => {
        const keepLastN = 4
        setCompacting(true)
        const { data, error: err } = await compactConversationApi(chatId, { keepLastN, mode: 'auto' })
        if (err) {
          setCompacting(false); notify.error(err); return
        }
        // Local path → poll worker → finalize. Cloud path → already done.
        try {
          if (data?.mode === 'local' && data.jobId) {
            notify.loading(`${data.model || 'Studio Pro'} is summarising your earlier messages…`, { title: 'Compacting locally', key: 'compact' })
            const fin = await waitForCompactJob(data.jobId, keepLastN)
            notify.success(`Compressed ${fin?.compacted ?? 0} messages into one summary · model ${data.model || 'Studio Pro'}`, { title: '🜲 Chat compacted', key: 'compact' })
          } else {
            notify.success(`Compressed ${data?.compacted ?? 0} messages via cloud fallback (5090 was offline)`, { title: '🜲 Chat compacted' })
          }
          const { data: refreshed } = await getConversation(chatId)
          if (refreshed) {
            setMessages(refreshed.messages || [])
            setSidebarRefresh(n => n + 1)
          }
        } catch (compactErr) {
          notify.error(compactErr.message, { title: 'Compact failed', key: 'compact' })
        } finally {
          setCompacting(false)
        }
      },
    })
  }

  // Helper: poll a chat job until status terminal, then append assistant
  const pollChatJob = (jobId, optimisticAssistantId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getChatJobStatus(jobId)
      if (err) {
        if (attempts > 5) {
          clearInterval(pollRef.current); pollRef.current = null
          setSending(false)
          notify.error(err)
        }
        return
      }
      if (!data) return
      if (data.status === 'completed') {
        clearInterval(pollRef.current); pollRef.current = null
        setMessages(prev => prev.map(m => m.messageId === optimisticAssistantId
          ? { ...m, content: data.reply, model: data.model, provider: data.provider,
              tokensIn: data.tokensIn, tokensOut: data.tokensOut, elapsedMs: data.elapsedMs,
              imageUrl: data.imageUrl || m.imageUrl || null,
              jobId, _pending: false }
          : m))
        setSending(false)
        setSidebarRefresh(n => n + 1)
      } else if (data.status === 'failed') {
        clearInterval(pollRef.current); pollRef.current = null
        setMessages(prev => prev.map(m => m.messageId === optimisticAssistantId
          ? { ...m, content: `⚠ ${data.error || 'Failed'}`, _pending: false, _failed: true }
          : m))
        setSending(false)
        notify.error(data.error || 'Generation failed')
      }
      if (attempts > 600) {  // ~10min @ 1s
        clearInterval(pollRef.current); pollRef.current = null
        setSending(false)
        notify.info('Timed out waiting — chat may still complete in the background')
      }
    }, 1500)
  }

  // Send — handles both 5090 (async via /api/chat/conversations/:id/messages)
  // AND cloud (sync via /api/groq, /api/gemini, /api/chat). Cloud paths
  // still append to the local messages array but DON'T hit the BE
  // conversation store — that's 5090-only for MVP. (Phase 2 can unify.)
  const handleSubmit = async ({ content, imageDataUrl, docName, docText }) => {
    if (!chatId) { notify.info('Open or create a chat first'); return }
    if (!model) { notify.info('Pick a model first'); return }
    setSending(true)

    // Optimistic user message
    const tempUserId = `tmp_u_${Date.now()}`
    const userMsg = {
      messageId: tempUserId, chatId, role: 'user',
      content: docText ? `${content}\n\n📎 ${docName} (${(docText.length / 1024).toFixed(1)} KB attached)` : content,
      imageUrl: imageDataUrl ? imageDataUrl : null,  // local preview only — BE returns the Cloudinary URL
      docName, createdAt: new Date().toISOString(), _pending: false,
    }
    const tempAsstId = `tmp_a_${Date.now()}`
    const asstMsg = {
      messageId: tempAsstId, chatId, role: 'assistant',
      content: '', model, provider,
      createdAt: new Date().toISOString(), _pending: true,
    }
    setMessages(prev => [...prev, userMsg, asstMsg])

    // Unified call — BE handles both async (5090 → queue + poll) and
    // sync (cloud → inline reply) paths, picking by `provider`. We
    // always persist to chat_messages regardless of provider so the
    // sidebar shows every chat with full history.
    const { data, error: err } = await sendChatMessage(chatId, {
      content, model, provider,
      imageDataUrl, docName, docText,
    })
    if (err) {
      setMessages(prev => prev.map(m => m.messageId === tempAsstId
        ? { ...m, content: `⚠ ${err}`, _pending: false, _failed: true } : m))
      setSending(false)
      notify.error(err)
      return
    }
    // Replace optimistic user-msg id with the real one + real Cloudinary
    // imageUrl if BE persisted one.
    if (data.userMessage) {
      setMessages(prev => prev.map(m => m.messageId === tempUserId
        ? { ...m, messageId: data.userMessage.messageId, imageUrl: data.userMessage.imageUrl }
        : m))
    }

    if (data.assistantMessage) {
      // Cloud sync path — BE already produced and persisted the reply.
      setMessages(prev => prev.map(m => m.messageId === tempAsstId
        ? { ...data.assistantMessage, _pending: false } : m))
      setSending(false)
      setSidebarRefresh(n => n + 1)
    } else if (data.jobId) {
      // 5090 async path — poll until worker callback fires.
      pollChatJob(data.jobId, tempAsstId)
    } else {
      setMessages(prev => prev.map(m => m.messageId === tempAsstId
        ? { ...m, content: '⚠ Unexpected server response', _pending: false, _failed: true } : m))
      setSending(false)
    }
  }

  // When the AnimatedAIChat hero submits, `handleNewChat` creates the
  // chat and stashes the intended first message in `pendingInitialSendRef`.
  // Once the new chatId is in the URL AND a model is selected, fire the
  // send and clear the ref. Guard against firing twice + against firing
  // when the user navigated to a different chat in between.
  useEffect(() => {
    const pending = pendingInitialSendRef.current
    if (!pending) return
    if (!chatId || pending.chatId !== chatId) return
    if (!model) return  // wait for model to be defaulted from availableModels
    pendingInitialSendRef.current = null
    handleSubmit({ content: pending.content })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, model])

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-gray-100 pt-24 sm:pt-32">
      <div className="flex">
        <ChatSidebar
          refreshKey={sidebarRefresh}
          onNewChat={handleNewChat}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 min-w-0 flex flex-col min-h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)]">
          {/* Header: provider tabs + model picker */}
          <header className="border-b border-gray-800 bg-gray-950/50 backdrop-blur-md px-3 sm:px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300">
                <MenuOutlined />
              </button>
              <h1 className="font-poppins font-black text-xl sm:text-2xl leading-tight pb-0.5 text-white flex-1 min-w-0 truncate">
                {conversation?.title || 'AI Chat'}
              </h1>
              {provider === '5090' && (
                <span className={`luxe-card hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 !rounded-lg ${
                  localOnline ? 'text-emerald-300' : 'text-rose-300'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${localOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {localOnline ? 'Studio Pro online' : 'Studio Pro offline'}
                </span>
              )}
              {/* Right-side actions — only meaningful inside a chat */}
              {chatId && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Tooltip title={`Compact context (${liveCharStats.count} msgs, ${liveCharStats.chars.toLocaleString()} chars) — keeps the model fast on long chats`}>
                    <Button
                      size="small"
                      icon={<MergeCellsOutlined />}
                      onClick={onCompact}
                      loading={compacting}
                      className="luxe-btn luxe-btn-secondary">
                      <span className="hidden sm:inline">Compact</span>
                    </Button>
                  </Tooltip>
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    overlayInnerStyle={{ background: 'rgba(10, 10, 14, 0.96)', border: '1px solid rgba(75, 85, 99, 0.4)', backdropFilter: 'blur(8px)' }}
                    content={
                      <GenerationSettings
                        temperature={temperature}
                        maxTokens={maxTokens}
                        imageGenEnabled={imageGenEnabled}
                        imageGenModel={imageGenModel}
                        onChangeTemperature={(v) => { setTemperature(v); saveOverride({ temperature: v }) }}
                        onChangeMaxTokens={(v) => { setMaxTokens(v); saveOverride({ maxTokens: v }) }}
                        onChangeImageGen={(on) => {
                          setImageGenEnabled(on)
                          // First-time opt-in → seed with Flux Schnell so the picker isn't empty.
                          const seed = (on && !imageGenModel) ? '@cf/black-forest-labs/flux-1-schnell' : imageGenModel
                          if (on && !imageGenModel) setImageGenModel(seed)
                          saveOverride({ imageGenEnabled: on, imageGenModel: seed })
                        }}
                        onChangeImageGenModel={(v) => { setImageGenModel(v); saveOverride({ imageGenModel: v }) }}
                      />
                    }>
                    <Tooltip title="Tune: temperature, max tokens, image generation">
                      <Button
                        size="small"
                        icon={<SettingOutlined />}
                        className="luxe-btn luxe-btn-secondary">
                        <span className="hidden sm:inline">
                          {(temperature !== null || maxTokens !== null || imageGenEnabled) ? 'Tuned' : 'Tune'}
                        </span>
                      </Button>
                    </Tooltip>
                  </Popover>
                </div>
              )}
            </div>

            {/* Provider tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {PROVIDERS.map(p => {
                const active = provider === p.id
                return (
                  <button key={p.id} onClick={() => setProvider(p.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
                      active
                        ? `text-white ${p.accent} border-transparent`
                        : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
                    }`}>
                    {p.icon} {p.label}
                  </button>
                )
              })}
            </div>

            {/* Model picker for the current provider.
                When an image is attached, non-vision options are
                rendered disabled with a "vision needed" hint so the
                user knows exactly which models will see the image. */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Select size="middle"
                value={model || undefined}
                onChange={(v) => {
                  setModel(v)
                  if (chatId) updateConversation(chatId, { model: v, provider })
                }}
                style={{ flex: 1, minWidth: 240 }}
                placeholder={provider === '5090'
                  ? (localModels.length ? 'Search a model…' : 'No 5090 models available right now — try a cloud provider')
                  : 'Search a model…'}
                disabled={!availableModels.length}
                popupMatchSelectWidth={false}
                showSearch allowClear
                optionFilterProp="name"
                filterOption={(input, option) => (option?.name ?? '').toLowerCase().includes(input.toLowerCase())}
                options={availableModels.map(m => {
                  // For cloud-gemini every model is multimodal — treat
                  // as vision-capable. For 5090 we read the isVision
                  // flag derived from the model id. For Groq /
                  // oracle-ollama we don't have any vision models so
                  // they all get disabled when an image is attached.
                  const providerHasVision = provider === 'cloud-gemini' || !!m.isVision
                  const disabledByImage = hasImageAttached && !providerHasVision
                  return {
                    value: m.id,
                    name: `${m.name} ${m.best || ''}`,
                    disabled: disabledByImage,
                    label: (
                      <div className={`leading-tight py-0.5 pr-2 ${disabledByImage ? 'opacity-50' : ''}`}>
                        <div className="text-sm flex items-center gap-2">
                          <span>{m.name}</span>
                          {m.isVision && <Tag color="purple" style={{ margin: 0, fontSize: 9 }}>vision</Tag>}
                          {m.isCode && <Tag color="green" style={{ margin: 0, fontSize: 9 }}>code</Tag>}
                          {disabledByImage && <Tag color="default" style={{ margin: 0, fontSize: 9 }}>image not supported</Tag>}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {m.best}{m.size ? ` · ${fmtBytes(m.size)}` : ''}
                        </div>
                      </div>
                    ),
                  }
                })}
              />
              {selectedModelMeta && (
                <span className="text-[10px] text-gray-500 italic">
                  {selectedModelMeta.best}
                </span>
              )}
            </div>
          </header>

          {/* Messages area — overflow-x-hidden so a wide code block /
              long URL inside a single message never produces a page-
              wide horizontal scrollbar (code blocks have their own
              inner scroll, the chat itself stays purely vertical). */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-5 py-4 space-y-3">
            {!chatId ? (
              // Empty state: the animated composer hero sits at the top.
              // Submitting through it creates a chat + dispatches the
              // first message via the pending-send ref. The existing
              // provider grid + 5090 status panel still appear below it
              // unchanged.
              <>
                <AnimatedAIChat
                  heading="How can I help today?"
                  subheading="Type a command or ask a question"
                  placeholder="Ask anything — pick a brain below or just hit send"
                  onSend={(text) => handleNewChat(text)}
                />
                <WelcomeHero
                  provider={provider} localModels={localModels} localOnline={localOnline}
                  onPickProvider={setProvider} onNewChat={handleNewChat}
                />
              </>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12 text-sm">
                Start the conversation — type below or tap 🎙 to speak.
              </div>
            ) : (
              messages.map(m => <MessageBubble key={m.messageId} msg={m} />)
            )}
          </div>

          {/* Composer */}
          {chatId && (
            <div className="border-t border-gray-800 bg-gray-950/60 backdrop-blur-md px-3 sm:px-5 py-3">
              {/* Vision-mode hint — fires when an image is staged but
                  the current model can't see it. Surfaces the available
                  vision models so the user can switch in one click. */}
              {hasImageAttached && !acceptsVision && (
                <VisionSwitchHint
                  provider={provider}
                  available5090Vision={availableModels.filter(m => m.isVision)}
                  onSwitchProvider={(p) => setProvider(p)}
                  onSwitchModel={(m) => {
                    setModel(m)
                    if (chatId) updateConversation(chatId, { model: m, provider })
                  }}
                />
              )}
              <ChatInput
                disabled={!model || sending}
                sending={sending}
                placeholder={
                  acceptsVision
                    ? 'Ask anything — drop an image, a doc, or speak with the mic'
                    : 'Ask anything — attach a doc or speak with the mic'
                }
                acceptsVision={acceptsVision}
                onSubmit={handleSubmit}
                onAttachmentsChange={({ hasImage }) => setHasImageAttached(hasImage)}
                imageGenEnabled={imageGenEnabled}
                imageGenModel={imageGenModel}
                onToggleImageGen={(on) => {
                  setImageGenEnabled(on)
                  const seed = (on && !imageGenModel) ? '@cf/black-forest-labs/flux-1-schnell' : imageGenModel
                  if (on && !imageGenModel) setImageGenModel(seed)
                  saveOverride({ imageGenEnabled: on, imageGenModel: seed })
                }}
                onChangeImageGenModel={(v) => { setImageGenModel(v); saveOverride({ imageGenModel: v }) }}
              />
              <p className="text-[9px] text-gray-600 mt-1.5 px-1">
                {provider === '5090'
                  ? `Studio Pro · ${model || 'no model'} · responses stay private`
                  : `Cloud · ${model || 'no model'}`}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Welcoming empty state ──────────────────────────────────
function WelcomeHero({ provider, localModels, localOnline, onPickProvider, onNewChat }) {
  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-12 px-2">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <ChatLogo size={56} glow />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-cyan-500/12 border border-cyan-500/30 text-[10px] uppercase tracking-wider text-cyan-200 font-semibold mb-3">
          AI Chat · 4 providers
        </div>
        <h2 className="text-2xl sm:text-4xl font-black leading-tight pb-1 text-white">
          Pick a brain and start a conversation
        </h2>
        <p className="text-gray-400 text-sm mt-2 max-w-xl mx-auto">
          Switch between providers on the fly. Each chat saves automatically — find them in the sidebar.
        </p>
      </div>

      {/* Provider grid — 3D tilt feel via translateY hover */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {PROVIDERS.map(p => {
          const active = provider === p.id
          return (
            <button key={p.id} onClick={() => onPickProvider(p.id)}
              className={`luxe-card luxe-card-hover relative p-4 text-left overflow-hidden ${
                active ? 'border-amber-500/40' : ''
              }`}>
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold inline-flex items-center gap-2 ${active ? 'text-white' : 'text-gray-200'}`}>{p.icon}{p.label}</span>
                  {active && <CheckOutlined className="text-amber-300" />}
                </div>
                <p className="text-[11px] text-gray-400 leading-snug">{p.blurb}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* 5090 lane status panel */}
      {provider === '5090' && (
        <div className="relative z-10 rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 mb-6">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <h3 className="text-sm font-bold text-amber-300 inline-flex items-center gap-2">
              <ThunderboltOutlined /> Studio Pro — {localOnline ? 'online' : 'offline'}
            </h3>
            <span className="text-[10px] font-mono text-gray-500">
              {localModels.length} model{localModels.length === 1 ? '' : 's'} installed
            </span>
          </div>
          {!localOnline && (
            <p className="text-[11px] text-rose-300 leading-snug mb-2">
              The personal 5090 lane is taking a break right now — try a cloud provider above.
            </p>
          )}
          {localOnline && localModels.length === 0 && (
            <p className="text-[11px] text-amber-300 leading-snug mb-2">
              No local models loaded yet — try a cloud provider above.
            </p>
          )}
          {localModels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {localModels.slice(0, 8).map(m => (
                <span key={m.name} className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-900/80 border border-gray-700 text-gray-300 font-mono">
                  {m.name}
                </span>
              ))}
              {localModels.length > 8 && (
                <span className="text-[10px] text-gray-500">+ {localModels.length - 8} more…</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-center">
        <Button type="primary" size="large" onClick={onNewChat}
          icon={<span className="inline-flex items-center"><ChatLogo size={18} /></span>}
          className="luxe-btn luxe-btn-primary !h-12 !px-6">
          Start a new chat
        </Button>
      </div>

      {/* Helper grid */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2 mt-8">
        <HelpCard icon={<AudioOutlined />} title="Speak it" body="Tap the mic in the input row — Whisper transcribes your voice straight into the prompt." />
        <HelpCard icon={<CameraOutlined />} title="Attach an image" body="Vision models on 5090 (Qwen2.5-VL, Llama Vision) accept images for OCR, charts, screenshots." />
        <HelpCard icon={<FileTextOutlined />} title="Drop a document" body="Plain text, markdown, JSON, CSV, logs — gets embedded into your message for analysis." />
      </div>
    </div>
  )
}

// Inline banner shown above the composer when the user attaches an
// image but the current model can't process it. Suggests:
//   • for 5090: switch model to the first vision-capable one we have
//   • for cloud-groq / oracle-ollama: switch provider to Studio Pro
//     (Gemini chip is hidden — Gemini lane is disabled on BE per §76)
function VisionSwitchHint({ provider, available5090Vision, onSwitchProvider, onSwitchModel }) {
  const has5090Vision = available5090Vision.length > 0
  return (
    <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-3 flex-wrap">
      <PictureOutlined className="text-base leading-none text-amber-300 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-amber-200 font-semibold">
          This model can't see images.
        </p>
        <p className="text-[10px] text-amber-300/80 leading-snug mt-0.5">
          Switch to a vision-capable model so the image gets used.
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {provider === '5090' && has5090Vision && available5090Vision.slice(0, 3).map(m => (
            <button key={m.id} onClick={() => onSwitchModel(m.id)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 hover:text-white transition-colors">
              <CheckOutlined className="text-[9px]" /> {m.name}
            </button>
          ))}
          {/* §76 — "Use Gemini" suggestion chip hidden (Gemini disabled). */}
          {false && provider !== 'cloud-gemini' && (
            <button onClick={() => onSwitchProvider('cloud-gemini')}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 hover:text-white transition-colors">
              <GoogleOutlined /> Use Gemini
            </button>
          )}
          {provider !== '5090' && has5090Vision && (
            <button onClick={() => onSwitchProvider('5090')}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 hover:text-white transition-colors">
              <ThunderboltOutlined /> Studio Pro vision
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function HelpCard({ icon, title, body }) {
  return (
    <div className="luxe-card p-3">
      <div className="text-xl text-amber-300 mb-1">{icon}</div>
      <div className="text-xs font-semibold text-gray-200 mb-1">{title}</div>
      <p className="text-[11px] text-gray-500 leading-relaxed">{body}</p>
    </div>
  )
}

// One-tap copy on every assistant reply. Swaps to a ✓ for 1.5s so the
// user gets clear feedback without an antd-toast overlay.
function CopyReplyButton({ text }) {
  const [done, setDone] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text || '')
      setDone(true); setTimeout(() => setDone(false), 1500)
    } catch {}
  }
  return (
    <Tooltip title={done ? 'Copied' : 'Copy reply'}>
      <button
        onClick={handle}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ${
          done
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            : 'border-gray-700 bg-gray-900/60 hover:bg-gray-800 text-gray-300 hover:text-white'
        }`}>
        {done ? <CheckOutlined /> : <CopyOutlined />}
        <span className="hidden sm:inline">{done ? 'Copied' : 'Copy'}</span>
      </button>
    </Tooltip>
  )
}

// ─── Single message bubble ──────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 mt-0.5">
          <ChatLogo size={32} />
        </div>
      )}
      <div className={`max-w-[88%] sm:max-w-[78%] min-w-0 break-words px-3 sm:px-4 py-2.5 overflow-hidden ${
        isUser
          ? 'rounded-lg bg-cyan-500/12 border border-cyan-500/30 text-gray-100'
          : msg._failed
            ? 'rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200'
            : 'luxe-card text-gray-100'
      }`}>
        {msg.imageUrl && (
          <MessageImage
            src={msg.imageUrl}
            messageId={msg.messageId}
            prompt={msg.imagePrompt || msg.docName || ''}
          />
        )}
        {msg._pending ? (
          <div className="flex items-center gap-2 py-1">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
            <span className="text-[10px] text-gray-500 ml-1">{msg.model || 'thinking'}…</span>
          </div>
        ) : (
          <div className="text-sm leading-relaxed">
            {isUser ? <p className="whitespace-pre-wrap">{msg.content}</p> : <MarkdownMessage content={msg.content || ''} />}
          </div>
        )}
        {!isUser && !msg._pending && (
          <div className="mt-2 pt-2 border-t border-gray-800 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono flex-wrap min-w-0">
              {msg.model && <span className="truncate max-w-[160px]">{msg.model}</span>}
              {msg.elapsedMs && <span>· {(msg.elapsedMs / 1000).toFixed(1)}s</span>}
              {msg.tokensOut && <span>· {msg.tokensOut} tok</span>}
            </div>
            {msg.content && !msg._failed && (
              <div className="flex items-center gap-1.5 shrink-0">
                <CopyReplyButton text={msg.content} />
                {/* Download only appears when the reply has structured
                    data (table / JSON rows). For plain prose, the
                    component renders nothing — Copy is enough. */}
                <DownloadMenu content={msg.content} messageId={msg.messageId} model={msg.model} />
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 shrink-0 rounded-lg bg-amber-500 flex items-center justify-center text-white">
          <UserOutlined />
        </div>
      )}
    </div>
  )
}

// Curated image-gen models (Cloudflare Workers AI). Default = Flux
// Schnell — 4 steps, fast, good quality, generous free tier.
const IMAGE_MODELS = [
  { id: '@cf/black-forest-labs/flux-1-schnell',                name: 'Flux Schnell',         hint: 'Fast · 4 steps · default' },
  { id: '@cf/bytedance/stable-diffusion-xl-lightning',         name: 'SDXL Lightning',       hint: 'Sharp · 5 steps' },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',        name: 'SDXL Base 1.0',        hint: 'Highest detail · slower' },
  { id: '@cf/lykon/dreamshaper-8-lcm',                          name: 'Dreamshaper 8 LCM',    hint: 'Stylized · 4 steps' },
]

// ─── Generation settings popover ───────────────────────────
// Per-conversation overrides — temperature, max tokens, and image-gen.
// Each setting is independent and persists on change. Defaults are
// optimised for each model; toggling stuff is purely opt-in.
function GenerationSettings({
  temperature, maxTokens, imageGenEnabled, imageGenModel,
  onChangeTemperature, onChangeMaxTokens, onChangeImageGen, onChangeImageGenModel,
}) {
  const tempIsSet = temperature !== null && temperature !== undefined
  const tokIsSet  = maxTokens !== null && maxTokens !== undefined
  const tempVal = tempIsSet ? temperature : 0.7
  const tokVal  = tokIsSet  ? maxTokens   : 1024
  const imgModel = imageGenModel || '@cf/black-forest-labs/flux-1-schnell'
  return (
    <div className="w-80 p-2 text-gray-200">
      <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
        <ExperimentOutlined className="text-cyan-300" /> Generation settings
      </div>
      <p className="text-[10px] text-gray-500 mb-3 leading-snug">
        Defaults are optimized for each model. Override only if you know
        what you want — the chat works fine without touching these.
      </p>

      {/* Temperature */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-gray-300">
            Temperature <span className="text-gray-600">— creativity vs. focus</span>
          </label>
          <span className={`text-[10px] font-mono ${tempIsSet ? 'text-cyan-300' : 'text-gray-600'}`}>
            {tempIsSet ? tempVal.toFixed(2) : 'default'}
          </span>
        </div>
        <Slider
          min={0} max={2} step={0.05}
          value={tempVal}
          onChange={(v) => onChangeTemperature(v)}
          marks={{ 0: '0', 0.7: '0.7', 1.4: '1.4', 2: '2' }}
          tooltip={{ formatter: (v) => v?.toFixed(2) }}
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-600">Lower = focused · Higher = creative</span>
          {tempIsSet && (
            <button onClick={() => onChangeTemperature(null)}
              className="text-[10px] text-amber-400 hover:text-amber-200 underline">
              Use default
            </button>
          )}
        </div>
      </div>

      {/* Max tokens */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-gray-300">
            Max tokens <span className="text-gray-600">— reply length cap</span>
          </label>
          <span className={`text-[10px] font-mono ${tokIsSet ? 'text-cyan-300' : 'text-gray-600'}`}>
            {tokIsSet ? tokVal : 'default'}
          </span>
        </div>
        <InputNumber
          min={16} max={32000} step={64}
          value={tokVal}
          onChange={(v) => onChangeMaxTokens(typeof v === 'number' ? v : null)}
          size="small" className="w-full"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-600">~256 = short · ~4096 = essay</span>
          {tokIsSet && (
            <button onClick={() => onChangeMaxTokens(null)}
              className="text-[10px] text-amber-400 hover:text-amber-200 underline">
              Use default
            </button>
          )}
        </div>
      </div>

      {/* Image generation — opt-in. When OFF the model is told not to
          attempt image generation, and no Cloudflare call is made even
          if the model emits a marker. When ON the user picks the
          Cloudflare model that runs the actual render. */}
      <div className="mt-3 pt-3 border-t border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-gray-300 inline-flex items-center gap-1.5">
            <BgColorsOutlined /> Image generation <span className="text-gray-600">— allow "draw / make an image"</span>
          </label>
          <Switch
            size="small"
            checked={!!imageGenEnabled}
            onChange={(v) => onChangeImageGen?.(v)}
          />
        </div>
        {imageGenEnabled ? (
          <>
            <div className="flex items-center justify-between mb-1 mt-2">
              <label className="text-[11px] text-gray-400">Render with</label>
              <span className="text-[10px] font-mono text-cyan-300">
                {IMAGE_MODELS.find(m => m.id === imgModel)?.name || 'custom'}
              </span>
            </div>
            <Select
              size="small"
              value={imgModel}
              onChange={(v) => onChangeImageGenModel?.(v)}
              className="w-full"
              popupMatchSelectWidth={false}
              showSearch allowClear
              placeholder="Search image model…"
              optionFilterProp="name"
              filterOption={(input, option) => (option?.name ?? '').toLowerCase().includes(input.toLowerCase())}
              options={IMAGE_MODELS.map(m => ({
                name: `${m.name} ${m.hint || ''}`,
                value: m.id,
                label: (
                  <div className="leading-tight py-0.5">
                    <div className="text-xs font-semibold text-gray-100">{m.name}</div>
                    <div className="text-[10px] text-gray-500">{m.hint}</div>
                  </div>
                ),
              }))}
            />
            <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
              When on, asking the chat for an image triggers a real render —
              typically 3–8s.
            </p>
          </>
        ) : (
          <p className="text-[10px] text-gray-600 mt-1 leading-snug">
            Off: the chat will reply with text only. Toggle on to let it draw / paint /
            render images inline.
          </p>
        )}
      </div>

      {(tempIsSet || tokIsSet) && (
        <button
          onClick={() => { onChangeTemperature(null); onChangeMaxTokens(null) }}
          className="mt-3 w-full text-[11px] font-semibold py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200">
          Reset both to defaults
        </button>
      )}
    </div>
  )
}

export default AIChat
