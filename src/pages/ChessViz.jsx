import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'

const ChessEngine = lazy(() => import('../components/lab/ChessEngine'))

const Loader = () => (
  <div className='flex items-center justify-center py-32'>
    <div className='flex flex-col items-center gap-3'>
      <div className='w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin' />
      <span className='text-gray-400 text-sm'>Loading Chess Engine...</span>
    </div>
  </div>
)

export default function ChessViz() {
  return (
    <div className='min-h-screen bg-gray-950 text-white'>
      {/* Subtle grid bg */}
      <div className='fixed inset-0 pointer-events-none opacity-[0.03]'
        style={{ backgroundImage: 'radial-gradient(circle, #22d3ee 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div className='relative max-w-6xl mx-auto px-6 pt-28 pb-24'>
        {/* Breadcrumb */}
        <div className='flex items-center gap-2 text-sm text-gray-500 mb-6'>
          <Link to='/projects' className='hover:text-gray-300 transition-colors'>Projects</Link>
          <span>/</span>
          <span className='text-gray-300'>Chess Engine</span>
        </div>

        {/* Hero */}
        <div className='mb-10'>
          <div className='flex items-center gap-4 mb-3'>
            <span className='text-4xl'>♟</span>
            <div>
              <h1 className='font-poppins font-black text-4xl md:text-5xl bg-gradient-to-r from-amber-400 via-orange-400 to-red-500 bg-clip-text text-transparent'>
                Chess Engine
              </h1>
              <p className='text-gray-500 text-sm mt-1'>Live visualization of the engine running in your browser</p>
            </div>
          </div>

          <div className='flex flex-wrap gap-6 mt-4'>
            {[
              ['Language', 'C / JS', 'text-cyan-400'],
              ['Search', 'Alpha-Beta Pruning', 'text-green-400'],
              ['Board', '10×12 Array', 'text-purple-400'],
              ['Depth', 'Iterative Deepening', 'text-amber-400'],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className={`text-sm font-bold ${color}`}>{value}</div>
                <div className='text-[11px] text-gray-600'>{label}</div>
              </div>
            ))}
          </div>

          <div className='flex flex-wrap gap-3 items-center mt-5'>
            <a href='https://github.com/SiddharthFulia/Chess-engine'
              target='_blank' rel='noreferrer'
              className='px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg font-semibold transition-colors'>
              View Source on GitHub ↗
            </a>
            <Link to='/projects'
              className='px-4 py-2 bg-gray-800/50 hover:bg-gray-800 text-gray-400 text-sm rounded-lg font-semibold transition-colors'>
              ← Back to Projects
            </Link>
            {/* Private repo tooltip */}
            <div className='relative group'>
              <div className='w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center
                              text-gray-500 text-sm cursor-default hover:bg-gray-700 hover:text-gray-300 transition-colors font-serif italic'>
                i
              </div>
              <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-gray-900 text-xs
                              rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity
                              duration-200 whitespace-nowrap z-10 font-sans'>
                Private repo — proprietary algorithms & logic.
                <br />Request access via GitHub.
                <div className='absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white' />
              </div>
            </div>
          </div>

          <div className='mt-6 h-px bg-gradient-to-r from-amber-900/60 to-transparent' />
        </div>

        {/* How it works panel */}
        <div className='mb-8 grid grid-cols-1 md:grid-cols-3 gap-4'>
          {[
            {
              icon: '🧠',
              title: 'Alpha-Beta Pruning',
              desc: 'Minimax search with alpha-beta cutoffs eliminates branches that cannot influence the final decision, searching deeper in less time.',
            },
            {
              icon: '📊',
              title: 'Position Evaluation',
              desc: 'Material counting + piece-square tables score each position. The engine knows knights love the center and rooks love open files.',
            },
            {
              icon: '🔍',
              title: 'Iterative Deepening',
              desc: 'Searches depth 1, then 2, then 3... each iteration uses the previous best move for better ordering and faster pruning.',
            },
          ].map(item => (
            <div key={item.title} className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
              <span className='text-2xl'>{item.icon}</span>
              <h3 className='text-white font-bold text-sm mt-2'>{item.title}</h3>
              <p className='text-gray-500 text-xs mt-1 leading-relaxed'>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Chess Engine */}
        <div className='bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden'>
          <div className='flex items-center gap-2 px-5 py-3 bg-gray-800/60 border-b border-gray-700/60'>
            <span className='text-white font-semibold text-sm'>Live Chess Engine</span>
            <span className='px-2 py-0.5 bg-gray-800 text-amber-400 text-xs rounded font-mono'>Alpha-Beta</span>
            <span className='px-2 py-0.5 bg-gray-800 text-cyan-400 text-xs rounded font-mono'>Iterative Deepening</span>
            <span className='px-2 py-0.5 bg-gray-800 text-green-400 text-xs rounded font-mono'>Piece-Square Tables</span>
          </div>
          <div className='p-4'>
            <Suspense fallback={<Loader />}>
              <ChessEngine />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
