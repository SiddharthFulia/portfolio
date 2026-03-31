import { useState } from 'react'

const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]

const winner = board => {
  for (const [a, b, c] of WINS)
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  return board.every(Boolean) ? 'draw' : null
}

const minimax = (board, isMax, depth, alpha, beta) => {
  const w = winner(board)
  if (w === 'O') return 10 - depth
  if (w === 'X') return depth - 10
  if (w === 'draw') return 0

  if (isMax) {
    let best = -Infinity
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue
      board[i] = 'O'
      best = Math.max(best, minimax(board, false, depth + 1, alpha, beta))
      board[i] = null
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  } else {
    let best = Infinity
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue
      board[i] = 'X'
      best = Math.min(best, minimax(board, true, depth + 1, alpha, beta))
      board[i] = null
      beta = Math.min(beta, best)
      if (beta <= alpha) break
    }
    return best
  }
}

const bestMove = board => {
  let best = -Infinity, move = -1
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue
    board[i] = 'O'
    const score = minimax(board, false, 0, -Infinity, Infinity)
    board[i] = null
    if (score > best) { best = score; move = i }
  }
  return move
}

const TicTacToe = () => {
  const [board, setBoard] = useState(Array(9).fill(null))
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 })
  const [thinking, setThinking] = useState(false)
  const [lastAI, setLastAI] = useState(null)
  const [log, setLog] = useState([])

  const w = winner(board)
  const winLine = WINS.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c])

  const click = async i => {
    if (board[i] || w || thinking) return
    const nb = [...board]; nb[i] = 'X'
    setBoard(nb); setLog(['You played → cell ' + (i + 1)])

    const w1 = winner(nb)
    if (w1) { setScores(s => ({ ...s, [w1]: (s[w1] || 0) + 1 })); return }

    setThinking(true)
    await new Promise(r => setTimeout(r, 500))
    const move = bestMove([...nb])
    if (move !== -1) {
      nb[move] = 'O'; setLastAI(move)
      setBoard([...nb])
      setLog(l => [...l, 'AI played → cell ' + (move + 1) + ' (score: optimal)'])
      const w2 = winner(nb)
      if (w2) setScores(s => ({ ...s, [w2]: (s[w2] || 0) + 1 }))
    }
    setThinking(false)
  }

  const reset = () => { setBoard(Array(9).fill(null)); setLastAI(null); setLog([]) }

  return (
    <div className='bg-gray-900 rounded-xl p-6 flex flex-col lg:flex-row gap-8'>

      {/* Board */}
      <div className='flex flex-col items-center gap-4 flex-shrink-0'>
        <div className='text-sm h-6 text-center'>
          {thinking && <span className='text-yellow-400 animate-pulse'>🤖 AI computing optimal move…</span>}
          {!thinking && !w && <span className='text-gray-400'>Your turn — you are <span className='text-cyan-400 font-bold'>X</span></span>}
          {w === 'draw' && <span className='text-gray-300 font-semibold'>Draw — try harder!</span>}
          {w === 'X' && <span className='text-cyan-400 font-bold'>You won! (this shouldn't happen 😮)</span>}
          {w === 'O' && <span className='text-rose-400 font-bold'>AI wins — as always 🤖</span>}
        </div>

        <div className='grid grid-cols-3 gap-2'>
          {board.map((cell, i) => (
            <button key={i} onClick={() => click(i)}
              className={`w-20 h-20 rounded-xl text-4xl font-black select-none transition-all duration-150
                ${winLine?.includes(i) ? 'bg-emerald-900 ring-2 ring-emerald-400 scale-105' :
                  i === lastAI ? 'bg-rose-950 ring-1 ring-rose-600' : 'bg-gray-800 hover:bg-gray-750'}
                ${!cell && !w && !thinking ? 'hover:scale-105 cursor-pointer' : 'cursor-default'}
                ${cell === 'X' ? 'text-cyan-400' : 'text-rose-400'}`}>
              {cell || (thinking ? '' : '')}
            </button>
          ))}
        </div>

        {w && (
          <button onClick={reset}
            className='px-6 py-2 bg-cyan-500 text-black rounded-lg font-bold hover:bg-cyan-400 transition-all'>
            Play Again
          </button>
        )}

        <div className='flex gap-8 mt-1'>
          <div className='text-center'><div className='text-cyan-400 text-3xl font-black'>{scores.X}</div><div className='text-gray-500 text-xs mt-1'>You (X)</div></div>
          <div className='text-center'><div className='text-gray-400 text-3xl font-black'>{scores.draw || 0}</div><div className='text-gray-500 text-xs mt-1'>Draw</div></div>
          <div className='text-center'><div className='text-rose-400 text-3xl font-black'>{scores.O || 0}</div><div className='text-gray-500 text-xs mt-1'>AI (O)</div></div>
        </div>
      </div>

      {/* Explanation */}
      <div className='flex-1 flex flex-col gap-4'>
        <div className='bg-gray-800 rounded-xl p-5'>
          <h3 className='text-cyan-400 font-bold text-base mb-2'>🧠 Minimax + Alpha-Beta Pruning</h3>
          <p className='text-gray-400 text-sm leading-relaxed'>
            The AI is <strong className='text-white'>mathematically unbeatable</strong>. It explores every possible future game state using
            the Minimax algorithm and picks the move with the highest guaranteed score.
          </p>
          <div className='mt-3 grid grid-cols-2 gap-2 text-xs'>
            <div className='bg-gray-900 rounded-lg p-3'>
              <div className='text-cyan-400 font-semibold mb-1'>MAX (AI turn)</div>
              <div className='text-gray-400'>Picks move with highest score — AI plays best</div>
            </div>
            <div className='bg-gray-900 rounded-lg p-3'>
              <div className='text-rose-400 font-semibold mb-1'>MIN (Your turn)</div>
              <div className='text-gray-400'>Assumes you play perfectly — worst case for AI</div>
            </div>
            <div className='bg-gray-900 rounded-lg p-3'>
              <div className='text-yellow-400 font-semibold mb-1'>α-β Pruning</div>
              <div className='text-gray-400'>Skips branches that can't improve — ~60% faster</div>
            </div>
            <div className='bg-gray-900 rounded-lg p-3 font-mono text-xs'>
              <div className='text-green-400'>O wins → +10</div>
              <div className='text-rose-400'>X wins → −10</div>
              <div className='text-gray-400'>Draw  →   0</div>
            </div>
          </div>
          <p className='text-gray-600 text-xs mt-3'>
            9! = 362,880 possible games · α-β prunes ~60% · result is always optimal
          </p>
        </div>

        {log.length > 0 && (
          <div className='bg-gray-800 rounded-xl p-4'>
            <div className='text-gray-500 text-xs font-semibold mb-2 uppercase tracking-widest'>Move log</div>
            {log.map((l, i) => (
              <div key={i} className='text-xs text-gray-400 font-mono'>{l}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TicTacToe
