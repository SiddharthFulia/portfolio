import { useState, useEffect, useRef } from 'react'
import { Input, Button, Select, Slider, Collapse, Tag, Tooltip, message as antMessage } from 'antd'
import { SendOutlined, RobotOutlined, UserOutlined, CopyOutlined, CheckOutlined, SettingOutlined, AudioOutlined, StopOutlined, LoadingOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { checkHealth, sendChat, sendGroq, sendGemini, transcribeAudio } from '../api/ai'

const LOCAL_MODELS = [
  { id: 'phi3:mini', label: 'Phi-3 Mini', desc: 'Local, general purpose' },
  { id: 'llama3.2:1b', label: 'Llama 3.2 1B', desc: 'Local, fast' },
  { id: 'deepseek-coder:1.3b', label: 'DeepSeek Coder', desc: 'Local, code' },
]

const GROQ_MODELS = [
  { id: 'llama-3.1-8b', label: 'Llama 3.1 8B', desc: 'Fastest' },
  { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', desc: 'Best quality' },
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', desc: 'Most powerful' },
]

const GEMINI_MODELS = [
  { id: 'gemini-flash', label: 'Gemini 2.0 Flash', desc: 'Fast, free' },
  { id: 'gemini-flash-lite', label: 'Flash Lite', desc: 'Ultra light' },
  { id: 'gemini-pro', label: 'Gemini 1.5 Pro', desc: 'Best quality' },
]

const CodeBlock = ({ children, className }) => {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')
  const lang = className?.replace('language-', '') || ''

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
  <ReactMarkdown
    components={{
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
    }}
  >
    {content}
  </ReactMarkdown>
)

const AIChat = () => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('checking')
  const [provider, setProvider] = useState('groq') // 'local' | 'groq'
  const [model, setModel] = useState('llama-3.1-8b')
  const [system, setSystem] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(200)
  const [lastMs, setLastMs] = useState(null)
  const [lastTokens, setLastTokens] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Mic → STT state. ChatGPT-style flow: tap mic, speak, tap again to stop;
  // we transcribe via /api/stt (Whisper) and drop the text into the input
  // textarea so the user can review + edit before hitting Send.
  const [recState, setRecState] = useState('idle')  // idle | recording | transcribing
  const [recElapsed, setRecElapsed] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recStreamRef = useRef(null)
  const recTickRef = useRef(null)
  const recStartedRef = useRef(0)

  useEffect(() => () => {
    if (recTickRef.current) clearInterval(recTickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch {}
    }
    recStreamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const stopRecording = () => {
    if (recTickRef.current) { clearInterval(recTickRef.current); recTickRef.current = null }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch {}
    }
  }

  const handleMic = async () => {
    if (recState === 'recording') { stopRecording(); return }
    if (recState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recStreamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        recStreamRef.current?.getTracks().forEach(t => t.stop())
        recStreamRef.current = null
        setRecState('transcribing')
        // Blob → data URL → /api/stt
        const reader = new FileReader()
        reader.onloadend = async () => {
          const { data, error: err } = await transcribeAudio({ dataUrl: reader.result })
          setRecState('idle')
          if (err) { antMessage.error(`Transcribe failed: ${err}`); return }
          const text = (data?.text || '').trim()
          if (!text) { antMessage.warning('Empty transcript — try again, speak closer to the mic'); return }
          // Append to whatever is already in the input so users can chain
          // dictate-then-edit cycles.
          setInput(prev => prev.trim() ? `${prev.trim()} ${text}` : text)
          inputRef.current?.focus()
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = mr
      mr.start(100)
      recStartedRef.current = Date.now()
      setRecElapsed(0); setRecState('recording')
      recTickRef.current = setInterval(() => {
        const e = Math.floor((Date.now() - recStartedRef.current) / 1000)
        setRecElapsed(e)
        if (e >= 60) stopRecording()   // safety cap
      }, 250)
    } catch (e) {
      antMessage.error(`Could not access mic: ${e.message}`)
    }
  }

  useEffect(() => {
    const check = () => checkHealth().then(r => setStatus(r.online ? 'online' : 'offline'))
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setMessages(prev => [...prev, { role: 'user', content: text, time }])
    setInput('')
    setSending(true)

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    const t0 = Date.now()

    const sendFn = provider === 'groq' ? sendGroq : provider === 'gemini' ? sendGemini : sendChat
    const { data, error } = await sendFn(text, { history, model, context: 'general', system, maxTokens, temperature })

    setLastMs(Date.now() - t0)
    setLastTokens(data?.tokens || null)

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: data?.reply || error || 'No response',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isError: !!error,
    }])
    setSending(false)
    inputRef.current?.focus()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const clearChat = () => { setMessages([]); setLastMs(null); setLastTokens(null) }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="max-w-4xl w-full mx-auto flex flex-col flex-1 px-4 sm:px-6 pt-28 pb-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="font-poppins font-black text-4xl md:text-5xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
            AI Chat
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500' : status === 'offline' ? 'bg-red-500' : 'bg-gray-600 animate-pulse'}`} />
              <span className="text-xs text-gray-500">{status === 'online' ? 'Ollama connected' : status === 'offline' ? 'Server offline' : 'Connecting...'}</span>
            </div>
            <Tag color={provider === 'groq' ? 'purple' : provider === 'gemini' ? 'blue' : 'cyan'}>
              {provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : 'Local'}: {(provider === 'groq' ? GROQ_MODELS : provider === 'gemini' ? GEMINI_MODELS : LOCAL_MODELS).find(m => m.id === model)?.label}
            </Tag>
            {lastMs && <span className="text-xs text-gray-600 font-mono">{lastMs}ms</span>}
            {lastTokens && <span className="text-xs text-gray-600 font-mono">{lastTokens} tok</span>}
          </div>
        </div>

        {/* Settings */}
        <Collapse
          ghost
          size="small"
          className="mb-3"
          items={[{
            key: '1',
            label: <span className="text-xs text-gray-500"><SettingOutlined /> Settings</span>,
            children: (
              <div className="space-y-3 pb-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Provider</label>
                  <div className="flex gap-2 mb-2">
                    <Button size="small" type={provider === 'groq' ? 'primary' : 'default'}
                      onClick={() => { setProvider('groq'); setModel('llama-3.1-8b') }}
                      style={provider === 'groq' ? { background: '#7c3aed' } : {}}>
                      Groq
                    </Button>
                    <Button size="small" type={provider === 'gemini' ? 'primary' : 'default'}
                      onClick={() => { setProvider('gemini'); setModel('gemini-flash') }}
                      style={provider === 'gemini' ? { background: '#4285f4' } : {}}>
                      Gemini
                    </Button>
                    <Button size="small" type={provider === 'local' ? 'primary' : 'default'}
                      onClick={() => { setProvider('local'); setModel('phi3:mini') }}>
                      Ollama
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Model</label>
                  <Select value={model} onChange={setModel} size="small" style={{ width: '100%' }}
                    options={(provider === 'groq' ? GROQ_MODELS : provider === 'gemini' ? GEMINI_MODELS : LOCAL_MODELS).map(m => ({ value: m.id, label: `${m.label} — ${m.desc}` }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">System Prompt</label>
                  <Input value={system} onChange={e => setSystem(e.target.value)} size="small"
                    placeholder="e.g. You are a helpful coding assistant" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400">Temperature: {temperature}</label>
                    <Slider min={0} max={2} step={0.1} value={temperature} onChange={setTemperature} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Max Tokens: {maxTokens}</label>
                    <Slider min={50} max={2000} step={50} value={maxTokens} onChange={setMaxTokens} />
                  </div>
                </div>
              </div>
            ),
          }]}
        />

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <RobotOutlined style={{ fontSize: 48, color: '#374151' }} />
                <p className="text-gray-500 text-sm mt-4">Ask me anything</p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {['Explain React hooks', 'Write a Python sort', 'What is TCP/IP?', 'Integrate x²'].map(q => (
                    <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center shrink-0 mt-1">
                  <RobotOutlined style={{ fontSize: 14, color: '#fff' }} />
                </div>
              )}
              <div className={`max-w-[85%] ${
                m.role === 'user'
                  ? 'bg-cyan-600 text-white px-4 py-3 rounded-2xl rounded-br-md'
                  : m.isError
                    ? 'bg-red-900/30 border border-red-800/40 text-red-300 px-4 py-3 rounded-2xl rounded-bl-md'
                    : 'bg-gray-800/80 text-gray-200 px-4 py-3 rounded-2xl rounded-bl-md'
              }`}>
                {m.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <div className="text-sm leading-relaxed prose-invert">
                    <MarkdownMessage content={m.content} />
                  </div>
                )}
                <p className={`text-[10px] mt-1.5 ${m.role === 'user' ? 'text-cyan-200' : 'text-gray-600'}`}>{m.time}</p>
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-cyan-600 flex items-center justify-center shrink-0 mt-1">
                  <UserOutlined style={{ fontSize: 14, color: '#fff' }} />
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center shrink-0">
                <RobotOutlined style={{ fontSize: 14, color: '#fff' }} />
              </div>
              <div className="bg-gray-800/80 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  {[0, 150, 300].map(d => (
                    <div key={d} className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2 items-end">
          <Input.TextArea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              recState === 'recording'    ? `🎙 Recording… ${recElapsed}s · tap mic again to stop`
              : recState === 'transcribing' ? 'Transcribing…'
              : status === 'offline'         ? 'Server is offline...'
              : 'Type or tap the mic… (Shift+Enter for newline)'
            }
            disabled={status === 'offline' || recState !== 'idle'}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="flex-1"
            size="large"
          />
          {/* Mic — ChatGPT-style dictation. Tap → speak → tap → transcript
              lands in the input box. User can then edit and Send. */}
          <Tooltip title={
            recState === 'recording'    ? 'Stop recording'
            : recState === 'transcribing' ? 'Transcribing your speech…'
            : 'Speak instead of typing'
          }>
            <Button
              size="large"
              danger={recState === 'recording'}
              icon={
                recState === 'recording'    ? <StopOutlined />
                : recState === 'transcribing' ? <LoadingOutlined spin />
                : <AudioOutlined />
              }
              onClick={handleMic}
              disabled={status === 'offline' || recState === 'transcribing'}
              style={{ height: 'auto', minHeight: 40 }}
            />
          </Tooltip>
          <Tooltip title="Send (Enter)">
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!input.trim() || sending || status === 'offline' || recState !== 'idle'}
              style={{ height: 'auto', minHeight: 40 }}
            />
          </Tooltip>
          {messages.length > 0 && (
            <Tooltip title="Clear chat">
              <Button size="large" onClick={clearChat} style={{ height: 'auto', minHeight: 40 }}>
                Clear
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIChat
