// AnimatedAIChat — embeddable composer with command palette + typing dots
// ────────────────────────────────────────────────────────────────────────
// Ported from the standalone TSX hero into a small, prop-driven React JSX
// component that can sit inside an existing page. The original was a
// full-screen hero with background blobs and an internal mock-send. This
// version:
//
//   • Calls back via `onSend(value)` instead of mock-sending. The parent
//     decides what to do with the trimmed text (e.g. create a chat, push
//     the message into it).
//   • Accepts `commandSuggestions`, `heading`, `subheading` so it can be
//     reused with different copy.
//   • Has a `showBackdrop` prop (default `false`). When false, the
//     full-page violet/indigo blobs are not rendered — important when
//     the component sits inside an existing dark page that already has
//     ambient blobs.
//   • Renders at the natural height of its content rather than
//     min-h-screen.
//
// Keeps the original:
//   • Command palette (/clone, /figma…) with arrow-key + Tab/Enter nav
//   • Typing dots "Thinking…" indicator
//   • Mouse-following soft gradient when the textarea is focused
//   • Auto-resizing textarea (60→200px)
//
// External CSS: `@keyframes luxe-ripple-keyframes` is defined in
// src/styles/luxe.css so we don't inject <style> tags at runtime.

import { useEffect, useRef, useCallback, useState, useTransition, forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  // `Figma` doesn't exist in the installed lucide-react. `Frame` reads
  // the same in the command-palette context (design-tool import action).
  ImageIcon, Frame as Figma, MonitorIcon, ArrowUpIcon, Paperclip, SendIcon,
  XIcon, LoaderIcon, Sparkles, Command,
} from 'lucide-react'

// Tiny classnames helper — replaces shadcn's `cn`. Filters falsy values
// and joins with a single space.
const cn = (...args) => args.filter(Boolean).join(' ')

// ─── Auto-resizing textarea hook ────────────────────────────────────
function useAutoResizeTextarea({ minHeight, maxHeight }) {
  const textareaRef = useRef(null)

  const adjustHeight = useCallback((reset) => {
    const ta = textareaRef.current
    if (!ta) return
    if (reset) { ta.style.height = `${minHeight}px`; return }
    ta.style.height = `${minHeight}px`
    const newHeight = Math.max(
      minHeight,
      Math.min(ta.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY),
    )
    ta.style.height = `${newHeight}px`
  }, [minHeight, maxHeight])

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) ta.style.height = `${minHeight}px`
  }, [minHeight])

  useEffect(() => {
    const onResize = () => adjustHeight()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [adjustHeight])

  return { textareaRef, adjustHeight }
}

// ─── Inline Textarea wrapper ────────────────────────────────────────
// Replaces the shadcn import — same animated focus ring, no extra deps.
const Textarea = forwardRef(function Textarea(
  { className, containerClassName, showRing = true, ...props },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false)
  return (
    <div className={cn('relative', containerClassName)}>
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'transition-all duration-200 ease-in-out',
          'placeholder:text-muted-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          showRing ? 'focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0' : '',
          className,
        )}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      {showRing && isFocused && (
        <motion.span
          className="absolute inset-0 rounded-md pointer-events-none ring-2 ring-offset-0 ring-violet-500/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
      {props.onChange && (
        // The ripple keyframes live in luxe.css. We attach the animation
        // name here so the dot can be triggered later via JS if desired.
        <div
          className="absolute bottom-2 right-2 opacity-0 w-2 h-2 bg-violet-500 rounded-full"
          style={{ animationName: 'luxe-ripple-keyframes' }}
          id="textarea-ripple"
        />
      )}
    </div>
  )
})

// ─── Typing dots indicator ──────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center ml-1">
      {[1, 2, 3].map(dot => (
        <motion.div
          key={dot}
          className="w-1.5 h-1.5 bg-white/90 rounded-full mx-0.5"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.15, ease: 'easeInOut' }}
          style={{ boxShadow: '0 0 4px rgba(255, 255, 255, 0.3)' }}
        />
      ))}
    </div>
  )
}

// ─── Default command suggestions ────────────────────────────────────
// Caller can override via the `commandSuggestions` prop. Each item:
//   { icon: ReactNode, label: string, description: string, prefix: string }
const DEFAULT_COMMANDS = [
  { icon: <ImageIcon  className="w-4 h-4" />, label: 'Clone UI',     description: 'Generate a UI from a screenshot', prefix: '/clone'   },
  { icon: <Figma      className="w-4 h-4" />, label: 'Import Figma', description: 'Import a design from Figma',      prefix: '/figma'   },
  { icon: <MonitorIcon className="w-4 h-4" />, label: 'Create Page', description: 'Generate a new web page',          prefix: '/page'    },
  { icon: <Sparkles   className="w-4 h-4" />, label: 'Improve',      description: 'Improve existing UI design',      prefix: '/improve' },
]

// ─── Main component ────────────────────────────────────────────────
export default function AnimatedAIChat({
  onSend,
  commandSuggestions = DEFAULT_COMMANDS,
  heading = 'How can I help today?',
  subheading = 'Type a command or ask a question',
  placeholder = 'Ask a question...',
  showBackdrop = false,
  className = '',
} = {}) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  // `isPending` is unused after we delegate sending to the parent — kept
  // here in case a future caller wants to wrap the send in a transition.
  // eslint-disable-next-line no-unused-vars
  const [isPending, startTransition] = useTransition()
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [recentCommand, setRecentCommand] = useState(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [inputFocused, setInputFocused] = useState(false)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 60, maxHeight: 200 })
  const commandPaletteRef = useRef(null)

  // Open the palette while the user is typing a `/cmd` prefix and the
  // value has no spaces yet (once they hit space we treat it as args).
  useEffect(() => {
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowCommandPalette(true)
      const match = commandSuggestions.findIndex(c => c.prefix.startsWith(value))
      setActiveSuggestion(match >= 0 ? match : -1)
    } else {
      setShowCommandPalette(false)
    }
  }, [value, commandSuggestions])

  // Mouse tracking for the focus-gradient halo. Only matters while
  // focused — but cheap enough to leave running.
  useEffect(() => {
    const onMove = e => setMousePosition({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // Click-outside closes the palette. The command-toggle button is
  // marked with [data-command-button] so its own clicks don't close it.
  useEffect(() => {
    const onDown = e => {
      const target = e.target
      const btn = document.querySelector('[data-command-button]')
      if (commandPaletteRef.current
          && !commandPaletteRef.current.contains(target)
          && !btn?.contains(target)) {
        setShowCommandPalette(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const selectCommandSuggestion = idx => {
    const cmd = commandSuggestions[idx]
    if (!cmd) return
    setValue(cmd.prefix + ' ')
    setShowCommandPalette(false)
    setRecentCommand(cmd.label)
    setTimeout(() => setRecentCommand(null), 2000)
  }

  const handleSendMessage = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    // Hand the text off to the parent. The parent decides what to do
    // (create a chat, push the message, etc.). We just clear the input.
    if (typeof onSend === 'function') {
      onSend(trimmed)
    } else {
      // Fallback when no `onSend` was provided — mimic the original demo
      // behaviour so the component is still useful in isolation.
      startTransition(() => {
        setIsTyping(true)
        setTimeout(() => setIsTyping(false), 2000)
      })
    }
    setValue('')
    adjustHeight(true)
  }

  const handleKeyDown = e => {
    if (showCommandPalette) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestion(prev => prev < commandSuggestions.length - 1 ? prev + 1 : 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestion(prev => prev > 0 ? prev - 1 : commandSuggestions.length - 1)
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        if (activeSuggestion >= 0) selectCommandSuggestion(activeSuggestion)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommandPalette(false)
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) handleSendMessage()
    }
  }

  const handleAttachFile = () => {
    // Mock attachment — same UX as the original. Real attachment plumbing
    // lives in the parent's <ChatInput> below this hero.
    const mockFileName = `file-${Math.floor(Math.random() * 1000)}.pdf`
    setAttachments(prev => [...prev, mockFileName])
  }
  const removeAttachment = idx => setAttachments(prev => prev.filter((_, i) => i !== idx))

  return (
    <div className={cn(
      'flex flex-col w-full items-center justify-center bg-transparent text-white p-4 sm:p-6 relative',
      className,
    )}>
      {/* Optional full-screen-blob backdrop. Off by default so the
          component can sit inside a page that already has ambient blobs
          (e.g. /ai uses <AmbientBlobs variant="subtle" />). */}
      {showBackdrop && (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full mix-blend-normal filter blur-[128px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full mix-blend-normal filter blur-[128px] animate-pulse delay-700" />
          <div className="absolute top-1/4 right-1/3 w-64 h-64 bg-fuchsia-500/10 rounded-full mix-blend-normal filter blur-[96px] animate-pulse delay-1000" />
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto relative">
        <motion.div
          className="relative z-10 space-y-8 sm:space-y-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* Heading */}
          <div className="text-center space-y-2 sm:space-y-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-block"
            >
              <h1 className="text-2xl sm:text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40 pb-1">
                {heading}
              </h1>
              <motion.div
                className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '100%', opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
              />
            </motion.div>
            <motion.p
              className="text-sm text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {subheading}
            </motion.p>
          </div>

          {/* Composer card */}
          <motion.div
            className="relative backdrop-blur-2xl bg-white/[0.02] rounded-2xl border border-white/[0.05] shadow-2xl"
            initial={{ scale: 0.98 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            {/* Command palette — floats above the composer */}
            <AnimatePresence>
              {showCommandPalette && (
                <motion.div
                  ref={commandPaletteRef}
                  className="absolute left-4 right-4 bottom-full mb-2 backdrop-blur-xl bg-black/90 rounded-lg z-50 shadow-lg border border-white/10 overflow-hidden"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="py-1 bg-black/95">
                    {commandSuggestions.map((suggestion, index) => (
                      <motion.div
                        key={suggestion.prefix}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer',
                          activeSuggestion === index
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:bg-white/5',
                        )}
                        onClick={() => selectCommandSuggestion(index)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <div className="w-5 h-5 flex items-center justify-center text-white/60">
                          {suggestion.icon}
                        </div>
                        <div className="font-medium">{suggestion.label}</div>
                        <div className="text-white/40 text-xs ml-1">{suggestion.prefix}</div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-4">
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={e => { setValue(e.target.value); adjustHeight() }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={placeholder}
                containerClassName="w-full"
                className={cn(
                  'w-full px-4 py-3',
                  'resize-none',
                  'bg-transparent',
                  'border-none',
                  'text-white/90 text-sm',
                  'focus:outline-none',
                  'placeholder:text-white/20',
                  'min-h-[60px]',
                )}
                style={{ overflow: 'hidden' }}
                showRing={false}
              />
            </div>

            {/* Attachments row */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  className="px-4 pb-3 flex gap-2 flex-wrap"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {attachments.map((file, index) => (
                    <motion.div
                      key={index}
                      className="flex items-center gap-2 text-xs bg-white/[0.03] py-1.5 px-3 rounded-lg text-white/70"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                    >
                      <span>{file}</span>
                      <button
                        onClick={() => removeAttachment(index)}
                        className="text-white/40 hover:text-white transition-colors"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action bar */}
            <div className="p-4 border-t border-white/[0.05] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <motion.button
                  type="button"
                  onClick={handleAttachFile}
                  whileTap={{ scale: 0.94 }}
                  className="p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors relative group"
                >
                  <Paperclip className="w-4 h-4" />
                  <motion.span
                    className="absolute inset-0 bg-white/[0.05] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    layoutId="aac-button-highlight"
                  />
                </motion.button>
                <motion.button
                  type="button"
                  data-command-button
                  onClick={e => { e.stopPropagation(); setShowCommandPalette(prev => !prev) }}
                  whileTap={{ scale: 0.94 }}
                  className={cn(
                    'p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors relative group',
                    showCommandPalette && 'bg-white/10 text-white/90',
                  )}
                >
                  <Command className="w-4 h-4" />
                  <motion.span
                    className="absolute inset-0 bg-white/[0.05] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    layoutId="aac-button-highlight-2"
                  />
                </motion.button>
              </div>

              <motion.button
                type="button"
                onClick={handleSendMessage}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={isTyping || !value.trim()}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  'flex items-center gap-2',
                  value.trim()
                    ? 'bg-white text-[#0A0A0B] shadow-lg shadow-white/10'
                    : 'bg-white/[0.05] text-white/40',
                )}
              >
                {isTyping
                  ? <LoaderIcon className="w-4 h-4 animate-[spin_2s_linear_infinite]" />
                  : <SendIcon className="w-4 h-4" />}
                <span>Send</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Quick-pick command pills below the composer */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {commandSuggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion.prefix}
                onClick={() => selectCommandSuggestion(index)}
                className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg text-sm text-white/60 hover:text-white/90 transition-all relative group"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                {suggestion.icon}
                <span>{suggestion.label}</span>
                <motion.div
                  className="absolute inset-0 border border-white/[0.05] rounded-lg"
                  initial={false}
                  animate={{ opacity: [0, 1], scale: [0.98, 1] }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </motion.button>
            ))}
          </div>

          {/* Recent-command toast — surfaces when a /cmd was picked. */}
          <AnimatePresence>
            {recentCommand && (
              <motion.div
                className="text-center text-[11px] text-white/40"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                Selected: <span className="text-white/70">{recentCommand}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Typing-dots toast at the bottom — only fires if we used the
          internal mock-send fallback (no onSend prop). */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 backdrop-blur-2xl bg-white/[0.02] rounded-full px-4 py-2 shadow-lg border border-white/[0.05] z-40"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-7 rounded-full bg-white/[0.05] flex items-center justify-center text-center">
                <span className="text-xs font-medium text-white/90 mb-0.5">AI</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/70">
                <span>Thinking</span>
                <TypingDots />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mouse-following soft gradient — only when textarea focused. */}
      {inputFocused && (
        <motion.div
          className="fixed w-[50rem] h-[50rem] rounded-full pointer-events-none z-0 opacity-[0.02] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 blur-[96px]"
          animate={{ x: mousePosition.x - 400, y: mousePosition.y - 400 }}
          transition={{ type: 'spring', damping: 25, stiffness: 150, mass: 0.5 }}
        />
      )}
    </div>
  )
}
