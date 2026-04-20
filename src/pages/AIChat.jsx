import { useState, useEffect, useRef } from 'react'
import { checkHealth, sendChat } from '../api/ai'

const MODELS = [
  { id: 'phi3:mini', label: 'Phi-3 Mini', desc: 'Microsoft, general purpose' },
  { id: 'llama3.2:1b', label: 'Llama 3.2 1B', desc: 'Fast, lightweight' },
  { id: 'deepseek-coder:1.3b', label: 'DeepSeek Coder', desc: 'Code-focused' },
]

const AIChat = () => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('checking')
  const [model, setModel] = useState('phi3:mini')
  const [showSettings, setShowSettings] = useState(false)
  const [system, setSystem] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(200)
  const [lastMs, setLastMs] = useState(null)
  const [lastTokens, setLastTokens] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

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

    const { data, error } = await sendChat(text, {
      history,
      model,
      context: 'general',
    })

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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="max-w-4xl w-full mx-auto flex flex-col flex-1 px-4 sm:px-6 pt-28 pb-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="font-poppins font-black text-4xl md:text-5xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
            AI Chat
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500' : status === 'offline' ? 'bg-red-500' : 'bg-gray-600 animate-pulse'}`} />
            <span className="text-xs text-gray-500">{status === 'online' ? 'Ollama connected' : status === 'offline' ? 'Server offline' : 'Connecting...'}</span>
            {lastMs && <span className="text-xs text-gray-600 font-mono">{lastMs}ms</span>}
            {lastTokens && <span className="text-xs text-gray-600 font-mono">{lastTokens} tokens</span>}
          </div>
        </div>

        {/* Settings toggle */}
        <div className="mb-3">
          <button onClick={() => setShowSettings(s => !s)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1">
            <svg className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Settings
          </button>

          {showSettings && (
            <div className="mt-2 p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-3">
              {/* Model select */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Model</label>
                <div className="flex flex-wrap gap-2">
                  {MODELS.map(m => (
                    <button key={m.id} onClick={() => setModel(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        model === m.id ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                      title={m.desc}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* System prompt */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">System Prompt</label>
                <input type="text" value={system} onChange={e => setSystem(e.target.value)}
                  placeholder="e.g. You are a helpful coding assistant"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500" />
              </div>

              {/* Sliders */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Temperature</span>
                    <input type="number" min="0" max="2" step="0.1" value={temperature}
                      onChange={e => setTemperature(parseFloat(e.target.value) || 0)}
                      className="w-12 bg-gray-800 text-cyan-400 text-xs font-mono text-right px-1 py-0.5 rounded border border-gray-700 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <input type="range" min="0" max="2" step="0.1" value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Max Tokens</span>
                    <input type="number" min="10" max="4000" step="10" value={maxTokens}
                      onChange={e => setMaxTokens(parseInt(e.target.value) || 100)}
                      className="w-16 bg-gray-800 text-cyan-400 text-xs font-mono text-right px-1 py-0.5 rounded border border-gray-700 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <input type="range" min="50" max="2000" step="50" value={maxTokens}
                    onChange={e => setMaxTokens(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <div className="text-5xl mb-4">🤖</div>
                <p className="text-gray-500 text-sm">Ask me anything</p>
                <p className="text-gray-700 text-xs mt-1">Powered by Ollama — {MODELS.find(m => m.id === model)?.label}</p>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                m.role === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-md'
                  : m.isError
                    ? 'bg-red-900/30 border border-red-800/40 text-red-300 rounded-bl-md'
                    : 'bg-gray-800 text-gray-200 rounded-bl-md'
              }`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                <p className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-cyan-200' : 'text-gray-600'}`}>{m.time}</p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={status === 'offline' ? 'Server is offline...' : 'Type a message...'}
            disabled={status === 'offline'}
            rows={1}
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm resize-none focus:outline-none focus:border-cyan-500 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || status === 'offline'}
            className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIChat
