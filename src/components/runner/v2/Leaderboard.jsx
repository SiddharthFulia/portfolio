// Leaderboard — top scores filtered by difficulty.
// Backed by the existing /api/games/scores endpoint.

import { useEffect, useState } from 'react'
import { Segmented, Table, Spin } from 'antd'
import { getGameLeaderboard } from '../../../api/ai'
import { DIFFICULTIES } from './hooks/useGameState'

const fmtRelative = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

const DIFF_TONE = {
  easy:    'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  medium:  'border-amber-500/40   bg-amber-500/10   text-amber-200',
  hard:    'border-rose-500/40    bg-rose-500/10    text-rose-200',
  classic: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
}

export default function Leaderboard({ onBack }) {
  const [filter, setFilter]   = useState('all')
  const [rows,   setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [err,    setErr]      = useState(null)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    getGameLeaderboard({
      difficulty: filter === 'all' ? '' : filter,
      limit: 20,
    }).then(({ data, error }) => {
      setLoading(false)
      if (error) { setErr(error); return }
      setRows(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [])
    })
  }, [filter])

  const columns = [
    { title: '#',        dataIndex: 'rank', key: 'rank', width: 50, render: (_v, _r, idx) => <span className='font-mono text-gray-400'>{idx + 1}.</span> },
    { title: 'Player',   dataIndex: 'name', key: 'name', render: (v) => <span className='font-semibold text-gray-100'>{v}</span> },
    { title: 'Score',    dataIndex: 'score', key: 'score', align: 'right', render: (v) => <span className='font-mono tabular-nums text-amber-200'>{Number(v || 0).toLocaleString()}</span> },
    { title: 'Distance', dataIndex: 'distance', key: 'distance', align: 'right', responsive: ['sm'], render: (v) => <span className='font-mono tabular-nums text-gray-400'>{Math.floor(Number(v || 0)).toLocaleString()} m</span> },
    { title: 'Diff',     dataIndex: 'difficulty', key: 'difficulty', responsive: ['sm'], render: (v) => (
      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-semibold ${DIFF_TONE[v] || 'border-gray-700 bg-gray-900/60 text-gray-400'}`}>{v || '—'}</span>
    )},
    { title: 'When',     dataIndex: 'createdAt', key: 'createdAt', responsive: ['md'], render: (v) => <span className='text-[11px] font-mono text-gray-500'>{fmtRelative(v)}</span> },
  ]

  return (
    <div className='min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6'>
      <div className='max-w-3xl mx-auto'>
        <header className='mb-5 flex items-center justify-between gap-2 flex-wrap'>
          <div>
            <p className='text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80'>Hand Runner</p>
            <h1 className='mt-1 text-3xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-amber-200 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent'>
              Leaderboard
            </h1>
          </div>
          <button onClick={onBack}
            className='text-xs font-semibold px-4 py-2 rounded-full border border-gray-800 hover:border-gray-600 text-gray-300 min-h-[40px]'>
            ← Back
          </button>
        </header>

        <div className='mb-4'>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all',     label: 'All' },
              { value: 'easy',    label: 'Easy' },
              { value: 'medium',  label: 'Medium' },
              { value: 'hard',    label: 'Hard' },
              { value: 'classic', label: 'Classic' },
            ]}
          />
        </div>

        {err && (
          <p className='text-rose-400 text-xs font-mono mb-3'>✗ {err}</p>
        )}

        <Spin spinning={loading}>
          <Table
            dataSource={rows}
            columns={columns}
            rowKey={(r, i) => `${r.id || ''}-${i}`}
            pagination={false}
            size='middle'
            locale={{ emptyText: 'No scores yet for this difficulty. Be the first.' }}
          />
        </Spin>
      </div>
    </div>
  )
}
