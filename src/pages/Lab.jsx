import { useState } from 'react'
import ParticleCanvas from '../components/lab/ParticleCanvas'
import SortingVisualizer from '../components/lab/SortingVisualizer'
import PathfindingVisualizer from '../components/lab/PathfindingVisualizer'
import TicTacToe from '../components/lab/TicTacToe'
import GameOfLife from '../components/lab/GameOfLife'

const TABS = [
  {
    id: 'particles',
    label: '🌌 Neural Particles',
    tag: 'WebGL · Canvas',
    desc: 'Interactive particle field — 140 nodes auto-connect when nearby, repel from your cursor',
    Component: ParticleCanvas,
  },
  {
    id: 'sort',
    label: '📊 Sorting Algorithms',
    tag: 'Algorithms · O(n²) vs O(n log n)',
    desc: 'Live visualization of Bubble, Selection, Insertion, Quick & Merge sort with real-time comparison/swap counters',
    Component: SortingVisualizer,
  },
  {
    id: 'path',
    label: '🗺 Pathfinding',
    tag: 'A* · BFS · DFS · Graph Search',
    desc: 'Draw walls on the grid and watch A*, BFS & DFS find (or fail to find) the shortest path',
    Component: PathfindingVisualizer,
  },
  {
    id: 'ttt',
    label: '🤖 Minimax AI',
    tag: 'Game Theory · Alpha-Beta Pruning',
    desc: 'Unbeatable Tic-Tac-Toe AI using Minimax + α-β pruning — try to win (you can\'t)',
    Component: TicTacToe,
  },
  {
    id: 'life',
    label: '🔬 Game of Life',
    tag: 'Cellular Automaton · Conway 1970',
    desc: 'Conway\'s Game of Life — click cells, add preset patterns (Glider, Pulsar, R-Pentomino) and watch emergence',
    Component: GameOfLife,
  },
]

const Lab = () => {
  const [active, setActive] = useState('particles')
  const current = TABS.find(t => t.id === active)
  const { Component } = current

  return (
    <div className='min-h-screen bg-gray-950 text-white px-6 pb-16'>
      {/* Header */}
      <div className='max-w-6xl mx-auto pt-28 pb-8'>
        <div className='flex items-end gap-4'>
          <div>
            <h1 className='font-poppins font-black text-4xl md:text-5xl bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent'>
              Interactive Lab
            </h1>
            <p className='text-gray-400 mt-2 text-sm'>
              Algorithms, AI & visual experiments — click around and break things
            </p>
          </div>
          <div className='ml-auto hidden md:flex flex-col items-end gap-1 text-xs text-gray-600'>
            <span>React · Canvas · Zero dependencies</span>
            <span>All demos run 100% in the browser</span>
          </div>
        </div>

        {/* Tab pills */}
        <div className='mt-8 flex flex-wrap gap-2'>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActive(t.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200
                ${active === t.id
                  ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30 scale-105'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Active tab info */}
        <div className='mt-5 flex items-center gap-3'>
          <span className='px-2 py-0.5 bg-gray-800 text-cyan-400 text-xs rounded-md font-mono'>{current.tag}</span>
          <p className='text-gray-400 text-sm'>{current.desc}</p>
        </div>
      </div>

      {/* Demo */}
      <div className='max-w-6xl mx-auto'>
        <Component />
      </div>
    </div>
  )
}

export default Lab
