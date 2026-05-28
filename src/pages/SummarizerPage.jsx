import { useEffect } from 'react'
import { FileTextOutlined } from '@ant-design/icons'
import { Summarizer } from '../components/aitools'

// Lightweight standalone wrapper for the Summarizer tool. Lives in the
// Play menu as a quick utility (paste text → short summary, no auth, no
// queue). Used to be a tab inside the old AIStudio page; that page is
// being sunset and its useful pieces consolidated elsewhere.
export default function SummarizerPage() {
  useEffect(() => { document.title = 'Summarizer · Sid' }, [])
  return (
    <div className="relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      {/* Ambient orb — single subtle accent on a single-tool page */}
      <div aria-hidden className="ambient-orb ambient-orb-cool -top-32 -right-32 opacity-50 pointer-events-none" />

      <div className="relative max-w-3xl mx-auto">
        <header className="mb-8">
          <div className="eyebrow-mono mb-2 flex items-center gap-2">
            <FileTextOutlined className="text-amber-300" />
            // Quick utility · no queue, no auth
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold leading-tight pb-1 text-cyan-300">
            Summarizer
          </h1>
          <p className="text-sm text-gray-400 max-w-2xl mt-2">
            Paste any long article, conversation, or notes — get a tight summary back.
          </p>
        </header>
        <Summarizer />
      </div>
    </div>
  )
}
