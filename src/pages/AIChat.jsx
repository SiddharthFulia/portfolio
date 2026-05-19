import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Select, Tag, Tooltip, message as antMessage, Button } from 'antd'
import {
  RobotOutlined, UserOutlined, CopyOutlined, CheckOutlined, MenuOutlined,
  ThunderboltOutlined, CloudOutlined, DesktopOutlined, GoogleOutlined,
  PictureOutlined, FileTextOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import ChatSidebar from '../components/ChatSidebar'
import ChatInput from '../components/ChatInput'
import {
  listLocalModels, createConversation, getConversation, sendChatMessage,
  getChatJobStatus, updateConversation,
} from '../api/ai'

// ─── Provider catalog ────────────────────────────────────────────────
// Tabs across the top of the chat. Each provider has a curated model
// list with a "best for X" hint so users don't have to guess. The 5090
// list is hydrated dynamically from `/api/chat/local-models`.

// id keys are stable for the BE; labels are visitor-facing. The local
// runtime gets a premium-sounding name — visitors should perceive it
// as a powerful feature, not "running on someone's PC".
const PROVIDERS = [
  { id: '5090',          label: '⚡ Studio Pro',     icon: <ThunderboltOutlined />, blurb: 'Premium · private · multimodal',                      accent: 'from-amber-400 via-rose-400 to-fuchsia-500' },
  { id: 'cloud-groq',    label: '☁ Groq Cloud',     icon: <CloudOutlined />,      blurb: 'Hosted · sub-second tokens · Llama / GPT-OSS',         accent: 'from-cyan-400 to-blue-500' },
  { id: 'cloud-gemini',  label: '✨ Gemini',         icon: <GoogleOutlined />,    blurb: 'Google · multimodal · fast + free tier',               accent: 'from-blue-400 via-fuchsia-400 to-pink-400' },
  { id: 'oracle-ollama', label: '🛟 Standby',         icon: <DesktopOutlined />,  blurb: 'Lightweight fallback when other lanes are busy',       accent: 'from-emerald-400 to-cyan-400' },
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

  const pollRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => { document.title = chatId ? `Chat · ${chatId.slice(0,8)} · Sid` : 'AI Chat · Sid' }, [chatId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
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
        antMessage.error(err || 'Conversation not found')
        navigate('/ai')
        return
      }
      setConversation(data)
      setMessages(data.messages || [])
      if (data.provider) setProvider(data.provider)
      if (data.model) setModel(data.model)
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
  const handleNewChat = async () => {
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
      antMessage.error(err || 'Could not create chat')
      return
    }
    setSidebarRefresh(n => n + 1)
    navigate(`/ai/${encodeURIComponent(data.chatId)}`)
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
          antMessage.error(err)
        }
        return
      }
      if (!data) return
      if (data.status === 'completed') {
        clearInterval(pollRef.current); pollRef.current = null
        setMessages(prev => prev.map(m => m.messageId === optimisticAssistantId
          ? { ...m, content: data.reply, model: data.model, provider: data.provider,
              tokensIn: data.tokensIn, tokensOut: data.tokensOut, elapsedMs: data.elapsedMs,
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
        antMessage.error(data.error || 'Generation failed')
      }
      if (attempts > 600) {  // ~10min @ 1s
        clearInterval(pollRef.current); pollRef.current = null
        setSending(false)
        antMessage.warning('Timed out waiting — chat may still complete in the background')
      }
    }, 1500)
  }

  // Send — handles both 5090 (async via /api/chat/conversations/:id/messages)
  // AND cloud (sync via /api/groq, /api/gemini, /api/chat). Cloud paths
  // still append to the local messages array but DON'T hit the BE
  // conversation store — that's 5090-only for MVP. (Phase 2 can unify.)
  const handleSubmit = async ({ content, imageDataUrl, docName, docText }) => {
    if (!chatId) { antMessage.warning('Open or create a chat first'); return }
    if (!model) { antMessage.warning('Pick a model first'); return }
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
      antMessage.error(err)
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

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20">
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
              <h1 className="font-poppins font-black text-xl sm:text-2xl leading-tight pb-0.5 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                {conversation?.title || 'AI Chat'}
              </h1>
              {provider === '5090' && (
                <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${
                  localOnline
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${localOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {localOnline ? 'Studio Pro online' : 'Studio Pro offline'}
                </span>
              )}
            </div>

            {/* Provider tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {PROVIDERS.map(p => {
                const active = provider === p.id
                return (
                  <button key={p.id} onClick={() => setProvider(p.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border ${
                      active
                        ? `text-white bg-gradient-to-r ${p.accent} border-transparent shadow-md`
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
                  ? (localModels.length ? 'Pick a model' : 'No 5090 models available right now — try a cloud provider')
                  : 'Pick a model'}
                disabled={!availableModels.length}
                popupMatchSelectWidth={false}
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

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
            {!chatId ? (
              <WelcomeHero
                provider={provider} localModels={localModels} localOnline={localOnline}
                onPickProvider={setProvider} onNewChat={handleNewChat}
              />
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
                    ? 'Ask anything — drop an image with 📷, a doc with 📄, or speak with 🎙'
                    : 'Ask anything — attach a doc with 📄 or speak with 🎙'
                }
                acceptsVision={acceptsVision}
                onSubmit={handleSubmit}
                onAttachmentsChange={({ hasImage }) => setHasImageAttached(hasImage)}
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-amber-500/20 border border-cyan-500/30 text-[10px] uppercase tracking-wider text-cyan-200 font-semibold mb-3">
          <RobotOutlined /> AI Chat · 4 providers
        </div>
        <h2 className="text-2xl sm:text-4xl font-black leading-tight pb-1 bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-300 bg-clip-text text-transparent">
          Pick a brain and start a conversation
        </h2>
        <p className="text-gray-400 text-sm mt-2 max-w-xl mx-auto">
          Switch between providers on the fly. Each chat saves automatically — find them in the sidebar.
        </p>
      </div>

      {/* Provider grid — 3D tilt feel via translateY hover */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {PROVIDERS.map(p => {
          const active = provider === p.id
          return (
            <button key={p.id} onClick={() => onPickProvider(p.id)}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all overflow-hidden ${
                active
                  ? 'border-cyan-400/60 bg-gray-900 shadow-xl shadow-cyan-500/10 scale-[1.02]'
                  : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-700 hover:-translate-y-0.5'
              }`}>
              <div aria-hidden className={`absolute inset-0 pointer-events-none opacity-25 bg-gradient-to-br ${p.accent} mix-blend-overlay`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-200'}`}>{p.label}</span>
                  {active && <CheckOutlined className="text-cyan-300" />}
                </div>
                <p className="text-[11px] text-gray-400 leading-snug">{p.blurb}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* 5090 lane status panel */}
      {provider === '5090' && (
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-rose-500/5 to-fuchsia-500/5 p-4 mb-6">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <h3 className="text-sm font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent">
              ⚡ Studio Pro — {localOnline ? 'online' : 'offline'}
            </h3>
            <span className="text-[10px] font-mono text-gray-500">
              {localModels.length} model{localModels.length === 1 ? '' : 's'} installed
            </span>
          </div>
          {!localOnline && (
            <p className="text-[11px] text-rose-300 leading-snug mb-2">
              ⚠ The personal 5090 lane is taking a break right now — try a cloud provider above.
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
                <span key={m.name} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900/80 border border-gray-700 text-gray-300 font-mono">
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-center">
        <Button type="primary" size="large" icon={<RobotOutlined />} onClick={onNewChat}
          style={{ background: 'linear-gradient(135deg, #06b6d4, #7c3aed, #f59e0b)', border: 'none', fontWeight: 700 }}
          className="!h-12">
          Start a new chat
        </Button>
      </div>

      {/* Helper grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-8">
        <HelpCard icon="🎙" title="Speak it" body="Tap the mic in the input row — Whisper transcribes your voice straight into the prompt." />
        <HelpCard icon="📷" title="Attach an image" body="Vision models on 5090 (Qwen2.5-VL, Llama Vision) + Gemini accept images for OCR, charts, screenshots." />
        <HelpCard icon="📄" title="Drop a document" body="Plain text, markdown, JSON, CSV, logs — gets embedded into your message for analysis." />
      </div>
    </div>
  )
}

// Inline banner shown above the composer when the user attaches an
// image but the current model can't process it. Suggests:
//   • for 5090: switch model to the first vision-capable one we have
//   • for cloud-groq / oracle-ollama: switch provider to Gemini or Studio Pro
function VisionSwitchHint({ provider, available5090Vision, onSwitchProvider, onSwitchModel }) {
  const has5090Vision = available5090Vision.length > 0
  return (
    <div className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-3 flex-wrap">
      <span className="text-lg leading-none">🖼</span>
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
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 hover:text-white transition-colors">
              <CheckOutlined className="text-[9px]" /> {m.name}
            </button>
          ))}
          {provider !== 'cloud-gemini' && (
            <button onClick={() => onSwitchProvider('cloud-gemini')}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-blue-400/50 bg-blue-500/15 hover:bg-blue-500/25 text-blue-100 hover:text-white transition-colors">
              ✨ Use Gemini
            </button>
          )}
          {provider !== '5090' && has5090Vision && (
            <button onClick={() => onSwitchProvider('5090')}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-100 hover:text-white transition-colors">
              ⚡ Studio Pro vision
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function HelpCard({ icon, title, body }) {
  return (
    <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:-translate-y-0.5 transition-all">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs font-semibold text-gray-200 mb-1">{title}</div>
      <p className="text-[11px] text-gray-500 leading-relaxed">{body}</p>
    </div>
  )
}

// ─── Single message bubble ──────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 flex items-center justify-center text-white shadow-md">
          <RobotOutlined />
        </div>
      )}
      <div className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3 sm:px-4 py-2.5 ${
        isUser
          ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-gray-100'
          : msg._failed
            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200'
            : 'bg-gray-900/80 border border-gray-800 text-gray-100'
      }`}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="" className="max-h-64 rounded-lg mb-2 border border-gray-700" />
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
        {!isUser && !msg._pending && (msg.model || msg.elapsedMs) && (
          <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-2 text-[10px] text-gray-500 font-mono flex-wrap">
            {msg.model && <span>{msg.model}</span>}
            {msg.elapsedMs && <span>· {(msg.elapsedMs / 1000).toFixed(1)}s</span>}
            {msg.tokensOut && <span>· {msg.tokensOut} tok</span>}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white shadow-md">
          <UserOutlined />
        </div>
      )}
    </div>
  )
}

export default AIChat
