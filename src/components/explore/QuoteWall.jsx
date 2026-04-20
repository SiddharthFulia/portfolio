import { useState, useEffect } from 'react'
import { fetchQuotes } from '../../api/nasa'

const COLORS = [
  'from-cyan-500/20 to-blue-500/20 border-cyan-700/30',
  'from-purple-500/20 to-pink-500/20 border-purple-700/30',
  'from-amber-500/20 to-orange-500/20 border-amber-700/30',
  'from-green-500/20 to-emerald-500/20 border-green-700/30',
  'from-red-500/20 to-rose-500/20 border-red-700/30',
  'from-indigo-500/20 to-violet-500/20 border-indigo-700/30',
]

const QuoteWall = () => {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)

  const loadQuotes = async () => {
    setLoading(true)
    const { data } = await fetchQuotes()
    if (Array.isArray(data)) {
      const mapped = data.map(q => ({ content: q.q || q.content, author: q.a || q.author, tags: q.tags || [] }))
      setQuotes(prev => [...mapped, ...prev].slice(0, 30))
    }
    setLoading(false)
  }

  useEffect(() => { loadQuotes() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs">{quotes.length} quotes</span>
        <button onClick={loadQuotes} disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          Load More
        </button>
      </div>

      {loading && quotes.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="animate-pulse bg-gray-800 rounded-xl h-32" />)}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 gap-4 space-y-4">
          {quotes.map((q, i) => (
            <div key={q._id || i}
              className={`break-inside-avoid rounded-xl border bg-gradient-to-br p-5 ${COLORS[i % COLORS.length]}`}>
              <svg className="w-6 h-6 text-gray-600 mb-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.17 11 15c0 1.93-1.57 3.5-3.5 3.5-1.073 0-2.099-.49-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.17 21 15c0 1.93-1.57 3.5-3.5 3.5-1.073 0-2.099-.49-2.917-1.179z" />
              </svg>
              <p className="text-white text-sm leading-relaxed mb-3">{q.content}</p>
              <span className="text-gray-400 text-xs font-medium">— {q.author}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default QuoteWall
