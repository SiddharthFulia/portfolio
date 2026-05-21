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
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <FileTextOutlined className="text-cyan-400 text-xl" />
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
              Summarizer
            </h1>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Paste any long article, conversation, or notes — get a tight summary back. Quick utility, no queue.
          </p>
        </header>
        <Summarizer />
      </div>
    </div>
  )
}
