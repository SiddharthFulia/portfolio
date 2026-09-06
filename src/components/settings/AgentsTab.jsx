// Settings → Agents tab — "System Oracle" chat.
//
// Groq-backed agent that knows the current server + DB + queue + cron
// state. The BE composes a system prompt from a snapshot of PM2 processes,
// SQLite tables, RabbitMQ queues, cron jobs, memory / uptime — and streams
// the reply back as Server-Sent Events. This component:
//
//   1) Reads the snapshot on demand ("What the Oracle knows right now")
//      via GET /api/agents/system/context. Rendered as a Collapse panel
//      at the top so it's opt-in — no extra network cost on tab open.
//   2) Streams responses from POST /api/agents/system/stream. Consumes
//      the SSE, appends tokens to the in-flight assistant bubble as they
//      arrive. On the final `context-summary` event, records which
//      tables + PM2 processes + queues were consulted, plus the token
//      count, so the user can see what fed the answer.
//   3) Persists the thread to sessionStorage so a mid-scroll refresh
//      doesn't wipe the conversation. Cleared on "Reset" button.
//
// All fetches attach the vault JWT via the same header rule request.js
// uses elsewhere. The /settings page is already vault-gated, so no extra
// guard is needed here — if the tab renders, the user is authed.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmented, Input, Collapse, Tooltip } from 'antd'
import {
  RobotOutlined, SendOutlined, ReloadOutlined, DatabaseOutlined,
  ClusterOutlined, ClockCircleOutlined, ThunderboltOutlined,
  StopOutlined, CopyOutlined, CheckOutlined, UserOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { Button } from '../ui'
import { notice } from '../../lib/notice'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'
const STORAGE_KEY = 'sid-oracle-thread-v1'
const MODEL_KEY   = 'sid-oracle-model-v1'

// The 3 Groq models we expose. Value strings mirror the /api/groq shape
// the BE already accepts, so the agent route can forward them through.
const MODELS = [
  { value: 'llama-3.3-70b-versatile', label: '70B versatile',   hint: 'Best quality · default' },
  { value: 'openai/gpt-oss-120b',      label: 'GPT-OSS 120B',   hint: 'Most powerful' },
  { value: 'llama-3.1-8b-instant',     label: '8B instant',     hint: 'Fastest' },
]

const SUGGESTED = [
  'What tables exist?',
  'Which queues have backlog?',
  'What cron jobs are scheduled?',
  "How's memory looking?",
  'Which processes are running?',
  'What crashed recently?',
]

function vaultHeaders() {
  try {
    const t = localStorage.getItem('sid-vault-token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch { return {} }
}

// Cheap unique id — fine for React keys inside this session-only thread.
function mid() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── Markdown renderer for assistant bubbles ────────────────────────
// Matches the /ai chat's code block + inline code treatment so answers
// with a fenced ```sql``` sample render the same everywhere.
function CodeBlock({ className, children }) {
  const code = String(children || '').replace(/\n$/, '')
  const lang = /language-(\w+)/.exec(className || '')?.[1] || ''
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="my-2 rounded-lg border border-gray-800 overflow-hidden bg-gray-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700">
        <span className="text-[10px] text-gray-500 font-mono">{lang || 'code'}</span>
        <button onClick={copy} className="text-gray-500 hover:text-white transition-colors" aria-label="Copy code">
          {copied ? <CheckOutlined style={{ fontSize: 12, color: '#4caf50' }} /> : <CopyOutlined style={{ fontSize: 12 }} />}
        </button>
      </div>
      <pre className="p-3 bg-gray-950 overflow-x-auto text-xs leading-relaxed"><code>{code}</code></pre>
    </div>
  )
}
const InlineCode = ({ children }) => (
  <code className="px-1.5 py-0.5 bg-gray-800 text-cyan-300 text-xs rounded font-mono">{children}</code>
)
const OracleMarkdown = ({ content }) => (
  <ReactMarkdown components={{
    code: ({ inline, className, children }) =>
      inline ? <InlineCode>{children}</InlineCode> : <CodeBlock className={className}>{children}</CodeBlock>,
    p:  ({ children }) => <p  className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="text-sm">{children}</li>,
    h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
    strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
    em:     ({ children }) => <em     className="italic text-gray-300">{children}</em>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-amber-500 pl-3 my-2 text-gray-400 italic">{children}</blockquote>,
    a:  ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{children}</a>,
    table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full text-xs border border-gray-700">{children}</table></div>,
    th: ({ children }) => <th className="px-2 py-1 bg-gray-800 border border-gray-700 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="px-2 py-1 border border-gray-700">{children}</td>,
    hr: () => <hr className="my-3 border-gray-700" />,
  }}>{content}</ReactMarkdown>
)

// ─── Single bubble ──────────────────────────────────────────────────
function Bubble({ msg, streaming }) {
  const isUser = msg.role === 'user'
  const meta = msg.meta || {}
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-black">
          <RobotOutlined />
        </div>
      )}
      <div className={`max-w-[88%] sm:max-w-[78%] min-w-0 break-words px-3 sm:px-4 py-2.5 overflow-hidden ${
        isUser
          ? 'rounded-lg bg-amber-500/12 border border-amber-500/30 text-gray-100'
          : msg._failed
            ? 'rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200'
            : 'luxe-card text-gray-100'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
        ) : msg.content
            ? <div className="text-sm leading-relaxed"><OracleMarkdown content={msg.content} />{streaming && <span className="inline-block w-1.5 h-4 align-middle bg-amber-400 animate-pulse ml-0.5" />}</div>
            : (
              <div className="flex items-center gap-2 py-1">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
                <span className="text-[10px] text-gray-500 ml-1">Oracle thinking…</span>
              </div>
            )}
        {/* Assistant footer — model + tokens + which tables/queues the
            Oracle looked at. Only shown when the reply is done streaming. */}
        {!isUser && msg.content && !streaming && (meta.model || meta.tokens || (meta.tables && meta.tables.length) || (meta.queues && meta.queues.length) || (meta.processes && meta.processes.length)) && (
          <div className="mt-2 pt-2 border-t border-gray-800 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 font-mono">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 uppercase tracking-wider">
              <RobotOutlined /> Oracle
            </span>
            {meta.model && <span className="truncate max-w-[180px]">{meta.model}</span>}
            {meta.tokens ? <span>· {meta.tokens} tok</span> : null}
            {meta.elapsedMs ? <span>· {(meta.elapsedMs / 1000).toFixed(1)}s</span> : null}
            {meta.tables?.length ? (
              <Tooltip title={meta.tables.join(', ')}>
                <span className="inline-flex items-center gap-1 text-cyan-300"><DatabaseOutlined />{meta.tables.length} tables</span>
              </Tooltip>
            ) : null}
            {meta.queues?.length ? (
              <Tooltip title={meta.queues.join(', ')}>
                <span className="inline-flex items-center gap-1 text-fuchsia-300"><ClusterOutlined />{meta.queues.length} queues</span>
              </Tooltip>
            ) : null}
            {meta.processes?.length ? (
              <Tooltip title={meta.processes.join(', ')}>
                <span className="inline-flex items-center gap-1 text-emerald-300"><ThunderboltOutlined />{meta.processes.length} procs</span>
              </Tooltip>
            ) : null}
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

// ─── Main tab ───────────────────────────────────────────────────────
export default function AgentsTab() {
  // Model selector — persisted separately from the thread so switching
  // models mid-conversation doesn't burn the whole history.
  const [model, setModel] = useState(() => {
    try { return localStorage.getItem(MODEL_KEY) || MODELS[0].value } catch { return MODELS[0].value }
  })
  useEffect(() => { try { localStorage.setItem(MODEL_KEY, model) } catch {} }, [model])

  // Thread state — persisted to sessionStorage so refresh keeps context
  // but a new tab starts fresh (helpful when debugging).
  const [messages, setMessages] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  })
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch {}
  }, [messages])

  // Input + streaming state.
  const [input, setInput]       = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError]       = useState(null)
  const abortRef                = useRef(null)          // AbortController for the current fetch
  const scrollRef               = useRef(null)          // messages scroll container
  const streamingMidRef         = useRef(null)          // id of the currently-updating assistant bubble

  // Context inspector state — hits /api/agents/system/context on demand.
  const [context, setContext]   = useState(null)
  const [ctxLoading, setCtxLoading] = useState(false)
  const [ctxError,   setCtxError]   = useState(null)
  const [ctxOpen,    setCtxOpen]    = useState([])

  // Autoscroll to bottom on new / streaming messages. `behavior: 'auto'`
  // (instant) beats smooth here — during streaming, smooth chases the
  // last byte and never quite reaches the cursor.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // Load the snapshot the Oracle uses. Called when the Collapse panel
  // opens for the first time — no auto-fetch on tab mount so a passive
  // visit costs zero requests.
  const loadContext = async () => {
    if (ctxLoading) return
    setCtxLoading(true)
    setCtxError(null)
    try {
      const res = await fetch(`${BE_URL}/api/agents/system/context`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...vaultHeaders() },
      })
      if (!res.ok) {
        let msg = `Snapshot failed: ${res.status}`
        try { const b = await res.json(); if (b?.message) msg = b.message } catch {}
        setCtxError(msg)
        return
      }
      const body = await res.json()
      setContext(body?.data || body)
    } catch (e) {
      setCtxError(e?.message || 'Snapshot failed')
    } finally {
      setCtxLoading(false)
    }
  }

  // Stop mid-stream. Reader's `while` loop exits when the abort fires,
  // the bubble stays with whatever text arrived, and we drop the
  // streaming state so a new send is possible.
  const stop = () => {
    try { abortRef.current?.abort() } catch {}
    setStreaming(false)
  }

  // Send a message. Handles:
  //   • optimistic user bubble
  //   • empty assistant bubble that fills as tokens arrive
  //   • SSE frames of `data: <json>\n\n` with types
  //     'token' | 'context-summary' | 'error' | 'done'
  //   • trailing plain-text fallback if the BE isn't SSE (early builds
  //     may return a normal JSON response). We handle both shapes so
  //     the FE doesn't crash while the BE endpoint gets shipped.
  const send = async (rawText) => {
    const text = (rawText ?? input).trim()
    if (!text || streaming) return
    setInput('')
    setError(null)

    const userMid = mid()
    const asstMid = mid()
    streamingMidRef.current = asstMid

    // History array sent to the BE for context. Only the plain
    // {role, content} shape — no meta / ids.
    const history = messages
      .filter(m => m.content)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => ([
      ...prev,
      { id: userMid, role: 'user',      content: text, ts: Date.now() },
      { id: asstMid, role: 'assistant', content: '',   ts: Date.now() },
    ]))

    setStreaming(true)
    const started = Date.now()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`${BE_URL}/api/agents/system/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...vaultHeaders(),
        },
        body: JSON.stringify({ message: text, model, history }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        let msg = `Oracle unreachable: ${res.status}`
        try { const b = await res.json(); if (b?.message) msg = b.message } catch {}
        throw new Error(msg)
      }

      // Parse SSE. Frames arrive as `data: {...}\n\n`. We split on
      // double-newline and consume each frame's JSON. A trailing partial
      // frame stays in the buffer until the next chunk completes it.
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buf     = ''
      let   summary = null
      let   gotAnySse = false
      let   tokensOut = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // Split off any complete `data: …\n\n` frames.
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)

          // Each frame is a set of `field: value` lines. We only care
          // about `data:` lines, everything else (event:, id:, retry:)
          // is ignored to keep the parser tiny.
          const dataLines = frame.split('\n').filter(l => l.startsWith('data:'))
          if (!dataLines.length) continue

          const raw = dataLines.map(l => l.slice(5).trimStart()).join('\n')
          if (raw === '[DONE]') continue

          gotAnySse = true
          let payload = null
          try { payload = JSON.parse(raw) } catch {
            // Non-JSON data line — treat as a plain token.
            payload = { type: 'token', delta: raw }
          }
          const type = payload.type || (payload.delta ? 'token' : payload.summary ? 'context-summary' : 'unknown')

          if (type === 'token' || payload.delta) {
            const delta = payload.delta || payload.text || ''
            if (delta) {
              tokensOut += 1
              setMessages(prev => prev.map(m =>
                m.id === asstMid ? { ...m, content: (m.content || '') + delta } : m
              ))
            }
          } else if (type === 'context-summary' || type === 'summary') {
            summary = payload.summary || payload
          } else if (type === 'error') {
            throw new Error(payload.error || payload.message || 'Oracle stream error')
          } else if (type === 'done') {
            // BE may put the summary on the done frame instead of a
            // dedicated context-summary frame.
            if (payload.summary) summary = payload.summary
          }
        }
      }

      // Non-SSE fallback: the BE returned a plain JSON body. Parse the
      // buffered text as one JSON blob and treat `.reply` / `.content`
      // as the full assistant message.
      if (!gotAnySse && buf.trim()) {
        try {
          const body = JSON.parse(buf)
          const reply = body?.reply || body?.data?.reply || body?.content || body?.data?.content || ''
          if (reply) {
            setMessages(prev => prev.map(m =>
              m.id === asstMid ? { ...m, content: reply } : m
            ))
          }
          summary = body?.summary || body?.data?.summary || summary
          tokensOut = body?.tokens || body?.data?.tokens || tokensOut
        } catch {
          // Truly opaque — leave the bubble empty and surface the raw
          // body as an error so the user sees something actionable.
          throw new Error('Oracle returned an unrecognised response')
        }
      }

      // Stamp the assistant bubble's meta with what we learned.
      const elapsedMs = Date.now() - started
      setMessages(prev => prev.map(m =>
        m.id === asstMid ? {
          ...m,
          meta: {
            model:     summary?.model || model,
            tokens:    summary?.tokens || tokensOut || undefined,
            tables:    summary?.tables    || [],
            queues:    summary?.queues    || [],
            processes: summary?.processes || summary?.pm2 || [],
            crons:     summary?.crons     || [],
            elapsedMs,
          },
        } : m
      ))
    } catch (e) {
      const aborted = e?.name === 'AbortError'
      if (!aborted) {
        setError(e?.message || 'Oracle failed')
        notice.error(`Oracle: ${e?.message || 'failed'}`)
        setMessages(prev => prev.map(m =>
          m.id === asstMid && !m.content
            ? { ...m, content: `_Oracle failed: ${e?.message || 'unknown error'}_`, _failed: true }
            : m
        ))
      }
    } finally {
      setStreaming(false)
      streamingMidRef.current = null
      abortRef.current = null
    }
  }

  // Enter to send; Shift+Enter for newline. antd's TextArea onKeyDown
  // fires before onChange, so preventDefault + calling send() manually
  // is enough — no need to sync state first (input is already fresh).
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const resetThread = () => {
    if (streaming) return
    setMessages([])
    setError(null)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  }

  // Human-friendly summary of the loaded context — total counts pulled
  // out of whatever shape the BE returns. We tolerate missing keys so
  // the display doesn't NaN out if the BE ships a partial snapshot.
  const ctxSummary = useMemo(() => {
    if (!context) return null
    return {
      tables:    Array.isArray(context.tables)   ? context.tables.length   : (context.tableCount   ?? '—'),
      queues:    Array.isArray(context.queues)   ? context.queues.length   : (context.queueCount   ?? '—'),
      processes: Array.isArray(context.processes || context.pm2) ? (context.processes || context.pm2).length : (context.processCount ?? '—'),
      crons:     Array.isArray(context.crons)    ? context.crons.length    : (context.cronCount    ?? '—'),
      memoryMb:  context.memoryMb  || context.memory?.rssMb  || context.memory?.usedMb || null,
      uptimeSec: context.uptimeSec || context.uptime || null,
    }
  }, [context])

  return (
    <div className="space-y-4">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="luxe-glass rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <RobotOutlined className="text-amber-300" />
              <h2 className="text-base sm:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-300">
                System Oracle
              </h2>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
                Groq-backed
              </span>
            </div>
            <p className="text-xs text-gray-400 max-w-2xl">
              Ask anything about running processes, queues, tables, cron jobs, memory, uptime.
              The Oracle sees a live snapshot of the server before each answer.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Segmented
              size="small"
              value={model}
              onChange={setModel}
              options={MODELS.map(m => ({
                value: m.value,
                label: <Tooltip title={m.hint}><span className="text-[11px]">{m.label}</span></Tooltip>,
              }))}
            />
            <Tooltip title="Reset thread">
              <Button
                variant="ghost"
                size="small"
                icon={<ReloadOutlined />}
                onClick={resetThread}
                disabled={streaming || messages.length === 0}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ─── Context inspector ─────────────────────────────────── */}
      <Collapse
        activeKey={ctxOpen}
        onChange={(keys) => {
          const arr = Array.isArray(keys) ? keys : [keys]
          setCtxOpen(arr)
          if (arr.includes('ctx') && !context && !ctxLoading) loadContext()
        }}
        items={[{
          key: 'ctx',
          label: (
            <span className="text-sm font-bold inline-flex items-center gap-2">
              <DatabaseOutlined className="text-cyan-300" />
              What the Oracle knows right now
              {ctxSummary && (
                <span className="text-[10px] font-normal text-gray-500 font-mono">
                  · {ctxSummary.tables} tables · {ctxSummary.queues} queues · {ctxSummary.processes} procs · {ctxSummary.crons} crons
                </span>
              )}
            </span>
          ),
          children: (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-gray-400">
                  A raw dump of the snapshot the Oracle will read before answering. Refresh to re-pull.
                </p>
                <Button
                  variant="subtle"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={loadContext}
                  loading={ctxLoading}
                >
                  Refresh
                </Button>
              </div>
              {ctxError && (
                <p className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                  {ctxError}
                </p>
              )}
              {ctxLoading && !context && (
                <p className="text-xs text-gray-500 py-6 text-center">Loading snapshot…</p>
              )}
              {context && (
                <>
                  {/* Quick-glance stat pills. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatPill icon={<DatabaseOutlined />} accent="cyan"    label="Tables"    value={ctxSummary?.tables} />
                    <StatPill icon={<ClusterOutlined />}  accent="fuchsia" label="Queues"    value={ctxSummary?.queues} />
                    <StatPill icon={<ThunderboltOutlined />} accent="emerald" label="Processes" value={ctxSummary?.processes} />
                    <StatPill icon={<ClockCircleOutlined />} accent="amber" label="Cron jobs" value={ctxSummary?.crons} />
                  </div>
                  <details className="rounded-lg border border-gray-800 bg-gray-950/60">
                    <summary className="px-3 py-2 text-xs font-mono cursor-pointer text-gray-400 hover:text-gray-200 select-none">
                      Full snapshot (JSON)
                    </summary>
                    <pre className="p-3 text-[10.5px] leading-relaxed text-gray-300 overflow-x-auto max-h-80">
                      {JSON.stringify(context, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </div>
          ),
        }]}
      />

      {/* ─── Chat area ─────────────────────────────────────────── */}
      <div className="luxe-glass rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '60vh' }}>
        {/* Scrollable messages column. `flex-1` + `min-h-0` on the parent
            is the classic "let inner flex child scroll" trick. */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3"
          style={{ maxHeight: '60vh' }}
        >
          {messages.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-fuchsia-500/20 border border-amber-500/30 mb-2">
                <RobotOutlined className="text-amber-300 text-2xl" />
              </div>
              <p className="text-sm text-gray-300 font-bold">The Oracle is listening.</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Pick a suggested question below or type your own. Every answer is grounded in a fresh snapshot of the server.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <Bubble
              key={m.id}
              msg={m}
              streaming={streaming && m.id === streamingMidRef.current}
            />
          ))}
        </div>

        {error && (
          <div className="px-3 sm:px-4 py-2 border-t border-rose-500/30 bg-rose-500/10">
            <p className="text-xs font-mono text-rose-300">{error}</p>
          </div>
        )}

        {/* Suggested question chips — always visible so the user can
            branch off mid-thread without hunting for ideas. */}
        <div className="px-3 sm:px-4 pt-3 border-t border-gray-800/60 flex flex-wrap gap-1.5">
          {SUGGESTED.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={streaming}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-700 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200 text-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Ask the Oracle"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input row. TextArea autosizes so a long paste doesn't crop
            below-the-fold. Send is a primary Button; Stop swaps in
            while streaming. */}
        <div className="p-3 sm:p-4 border-t border-gray-800/60 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask the Oracle… (Enter to send · Shift+Enter for newline)"
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={streaming}
              className="!bg-gray-950/80"
            />
            <p className="text-[10px] text-gray-500 mt-1 font-mono">
              Model: <span className="text-amber-300">{model}</span> · Thread persisted in sessionStorage
            </p>
          </div>
          {streaming ? (
            <Button variant="danger" icon={<StopOutlined />} onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<SendOutlined />}
              onClick={() => send()}
              disabled={!input.trim()}
            >
              Ask
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Small stat pill for the context inspector ─────────────────────
function StatPill({ icon, label, value, accent = 'cyan' }) {
  const accents = {
    cyan:    'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    fuchsia: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    amber:   'border-amber-500/40 bg-amber-500/10 text-amber-300',
  }
  return (
    <div className={`rounded-lg border ${accents[accent] || accents.cyan} px-3 py-2 flex items-center gap-2`}>
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
        <div className="text-sm font-bold font-mono tabular-nums">{value ?? '—'}</div>
      </div>
    </div>
  )
}
