import { useState, useRef, useCallback } from 'react'

function buildHeapData(arr) {
  return arr.map((val, i) => ({
    val,
    index: i,
    parent: i === 0 ? null : Math.floor((i - 1) / 2),
    left: 2 * i + 1 < arr.length ? 2 * i + 1 : null,
    right: 2 * i + 2 < arr.length ? 2 * i + 2 : null,
  }))
}

function computeTreeLayout(arr, svgW) {
  const positions = {}
  if (!arr.length) return positions
  const height = Math.floor(Math.log2(arr.length)) + 1

  const place = (i, depth, left, right) => {
    if (i >= arr.length) return
    const cx = (left + right) / 2
    const cy = depth * 72 + 45
    positions[i] = { cx, cy }
    place(2 * i + 1, depth + 1, left, (left + right) / 2)
    place(2 * i + 2, depth + 1, (left + right) / 2, right)
  }
  place(0, 0, 0, svgW)
  return positions
}

export default function HeapVisualizer() {
  const [mode, setMode] = useState('min') // 'min' | 'max'
  const [heap, setHeap] = useState([10, 20, 15, 40, 30, 50, 25])
  const [input, setInput] = useState('')
  const [highlight, setHighlight] = useState([])
  const [swapPair, setSwapPair] = useState([])
  const [status, setStatus] = useState('Min Heap loaded. Try inserting or extracting.')
  const [animating, setAnimating] = useState(false)
  const timersRef = useRef([])

  const svgW = 680
  const svgH = 340
  const nodeR = 22

  const cmp = useCallback((a, b) => mode === 'min' ? a < b : a > b, [mode])

  const clearTimers = () => {
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []
  }

  const animateSteps = (steps, finalHeap, finalStatus) => {
    setAnimating(true)
    let delay = 0
    steps.forEach((step, i) => {
      const t = setTimeout(() => {
        setHighlight(step.highlight || [])
        setSwapPair(step.swap || [])
        setStatus(step.msg)
        if (step.heap) setHeap([...step.heap])
        if (i === steps.length - 1) {
          const last = setTimeout(() => {
            setHighlight([])
            setSwapPair([])
            setHeap([...finalHeap])
            setStatus(finalStatus)
            setAnimating(false)
          }, 450)
          timersRef.current.push(last)
        }
      }, delay)
      timersRef.current.push(t)
      delay += 500
    })
  }

  const handleInsert = useCallback(() => {
    const v = parseInt(input)
    if (isNaN(v) || animating) return
    setInput('')

    const arr = [...heap, v]
    const steps = []
    let i = arr.length - 1

    steps.push({ heap: [...arr], highlight: [i], msg: `Inserted ${v} at index ${i}` })

    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (cmp(arr[i], arr[parent])) {
        steps.push({ heap: [...arr], highlight: [i, parent], swap: [i, parent], msg: `Sift-up: swap index ${i} (${arr[i]}) ↔ index ${parent} (${arr[parent]})` });
        [arr[i], arr[parent]] = [arr[parent], arr[i]]
        steps.push({ heap: [...arr], highlight: [parent], msg: `After swap: ${arr[parent]} moved up to index ${parent}` })
        i = parent
      } else {
        steps.push({ heap: [...arr], highlight: [i], msg: `${arr[i]} ≥ parent — heap property satisfied` })
        break
      }
    }

    animateSteps(steps, arr, `Inserted ${v}. Heap size: ${arr.length}`)
  }, [heap, input, animating, cmp])

  const handleExtract = useCallback(() => {
    if (!heap.length || animating) return

    const arr = [...heap]
    const extracted = arr[0]
    const steps = []

    steps.push({ heap: [...arr], highlight: [0], msg: `Extract ${mode === 'min' ? 'min' : 'max'}: remove root (${extracted})` })

    if (arr.length === 1) {
      animateSteps(steps, [], `Extracted ${extracted}. Heap is now empty.`)
      return
    }

    arr[0] = arr[arr.length - 1]
    arr.pop()
    steps.push({ heap: [...arr], highlight: [0], msg: `Move last element (${arr[0]}) to root` })

    let i = 0
    while (true) {
      const left = 2 * i + 1
      const right = 2 * i + 2
      let target = i

      if (left < arr.length && cmp(arr[left], arr[target])) target = left
      if (right < arr.length && cmp(arr[right], arr[target])) target = right

      if (target !== i) {
        steps.push({ heap: [...arr], highlight: [i, target], swap: [i, target], msg: `Sift-down: swap index ${i} (${arr[i]}) ↔ index ${target} (${arr[target]})` });
        [arr[i], arr[target]] = [arr[target], arr[i]]
        steps.push({ heap: [...arr], highlight: [target], msg: `After swap: ${arr[target]} at index ${target}` })
        i = target
      } else {
        steps.push({ heap: [...arr], highlight: [i], msg: `Heap property satisfied at index ${i}` })
        break
      }
    }

    animateSteps(steps, arr, `Extracted ${extracted}. Heap size: ${arr.length}`)
  }, [heap, animating, cmp, mode])

  const handleHeapify = useCallback(() => {
    if (animating) return
    const vals = Array.from({ length: 8 }, () => Math.floor(Math.random() * 90) + 10)
    const arr = [...vals]
    const steps = []
    steps.push({ heap: [...arr], highlight: [], msg: `Heapify: starting with [${arr.join(', ')}]` })

    for (let i = Math.floor(arr.length / 2) - 1; i >= 0; i--) {
      let j = i
      steps.push({ heap: [...arr], highlight: [j], msg: `Sift-down from index ${j} (${arr[j]})` })
      while (true) {
        const left = 2 * j + 1
        const right = 2 * j + 2
        let target = j
        if (left < arr.length && cmp(arr[left], arr[target])) target = left
        if (right < arr.length && cmp(arr[right], arr[target])) target = right
        if (target !== j) {
          steps.push({ heap: [...arr], highlight: [j, target], swap: [j, target], msg: `Swap index ${j} (${arr[j]}) ↔ index ${target} (${arr[target]})` });
          [arr[j], arr[target]] = [arr[target], arr[j]]
          steps.push({ heap: [...arr], highlight: [target], msg: `Swapped` })
          j = target
        } else break
      }
    }

    animateSteps(steps, arr, `Heapify complete. ${mode === 'min' ? 'Min' : 'Max'} Heap built.`)
  }, [animating, cmp, mode])

  const handleModeToggle = (newMode) => {
    if (animating) return
    clearTimers()
    setMode(newMode)
    setHighlight([])
    setSwapPair([])
    // Re-heapify current array for new mode
    const arr = [...heap]
    const newCmp = newMode === 'min' ? (a, b) => a < b : (a, b) => a > b
    for (let i = Math.floor(arr.length / 2) - 1; i >= 0; i--) {
      let j = i
      while (true) {
        const left = 2 * j + 1
        const right = 2 * j + 2
        let target = j
        if (left < arr.length && newCmp(arr[left], arr[target])) target = left
        if (right < arr.length && newCmp(arr[right], arr[target])) target = right
        if (target !== j) {
          ;[arr[j], arr[target]] = [arr[target], arr[j]]
          j = target
        } else break
      }
    }
    setHeap(arr)
    setStatus(`Switched to ${newMode === 'min' ? 'Min' : 'Max'} Heap`)
  }

  const positions = computeTreeLayout(heap, svgW)

  const getNodeColor = (i) => {
    if (swapPair.includes(i)) return '#d97706'
    if (highlight.includes(i)) return '#7c3aed'
    if (i === 0) return mode === 'min' ? '#0369a1' : '#991b1b'
    return '#1e3a4a'
  }
  const getStroke = (i) => {
    if (swapPair.includes(i)) return '#fbbf24'
    if (highlight.includes(i)) return '#a78bfa'
    if (i === 0) return mode === 'min' ? '#38bdf8' : '#f87171'
    return '#22d3ee'
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white select-none">
      {/* Mode toggle */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {['min', 'max'].map(m => (
            <button key={m} onClick={() => handleModeToggle(m)}
              className={`px-4 py-1.5 text-sm font-bold transition-colors ${mode === m
                ? (m === 'min' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white')
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {m === 'min' ? 'Min Heap' : 'Max Heap'}
            </button>
          ))}
        </div>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInsert()}
          placeholder="Value" disabled={animating}
          className="bg-gray-800 border border-gray-700 text-cyan-300 placeholder-gray-600 px-3 py-1.5 rounded-lg font-mono text-sm w-28 focus:outline-none focus:border-cyan-500 disabled:opacity-50" />
        <button onClick={handleInsert} disabled={animating}
          className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          Insert
        </button>
        <button onClick={handleExtract} disabled={animating || !heap.length}
          className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          Extract {mode === 'min' ? 'Min' : 'Max'}
        </button>
        <button onClick={handleHeapify} disabled={animating}
          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          Heapify
        </button>
        <span className="ml-auto text-xs text-gray-400">Size: <span className="text-cyan-400 font-bold">{heap.length}</span></span>
      </div>

      {/* Status */}
      <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border transition-all ${
        animating ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300'
      }`}>
        {animating && <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse" />}
        {status}
      </div>

      {/* Tree SVG */}
      <div className="bg-gray-950 rounded-xl overflow-x-auto mb-4">
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: 400 }}>
          <defs>
            <filter id="heap-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {heap.map((_, i) => {
            const parentIdx = Math.floor((i - 1) / 2)
            if (i === 0 || !positions[i] || !positions[parentIdx]) return null
            return (
              <line key={`e-${i}`}
                x1={positions[parentIdx].cx} y1={positions[parentIdx].cy}
                x2={positions[i].cx} y2={positions[i].cy}
                stroke="#374151" strokeWidth="2" />
            )
          })}
          {heap.map((val, i) => {
            if (!positions[i]) return null
            const { cx, cy } = positions[i]
            const fill = getNodeColor(i)
            const stroke = getStroke(i)
            const isActive = highlight.includes(i) || swapPair.includes(i)
            return (
              <g key={`n-${i}`}>
                <circle cx={cx} cy={cy} r={nodeR} fill={fill} stroke={stroke} strokeWidth="2"
                  style={{ filter: isActive ? 'url(#heap-glow)' : 'none', transition: 'fill 0.3s' }} />
                <text x={cx} y={cy + 5} textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="monospace">{val}</text>
                <text x={cx} y={cy - nodeR - 4} textAnchor="middle" fill="#6b7280" fontSize="9" fontFamily="monospace">[{i}]</text>
              </g>
            )
          })}
          {heap.length === 0 && (
            <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill="#4b5563" fontSize="16">Heap is empty</text>
          )}
        </svg>
      </div>

      {/* Array representation */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1.5 font-mono">Array representation (0-indexed):</div>
        <div className="flex flex-wrap gap-1.5">
          {heap.map((val, i) => {
            const isHighlighted = highlight.includes(i) || swapPair.includes(i)
            return (
              <div key={i} className={`flex flex-col items-center rounded-lg overflow-hidden border transition-all ${
                swapPair.includes(i) ? 'border-yellow-400' : isHighlighted ? 'border-purple-400' : i === 0 ? 'border-cyan-600' : 'border-gray-700'
              }`}>
                <div className={`px-3 py-1.5 text-sm font-mono font-bold transition-colors ${
                  swapPair.includes(i) ? 'bg-amber-700 text-white' : isHighlighted ? 'bg-purple-800 text-white' : i === 0 ? 'bg-blue-900/60 text-cyan-300' : 'bg-gray-800 text-gray-300'
                }`}>{val}</div>
                <div className="px-3 py-0.5 bg-gray-900 text-gray-600 text-xs font-mono">[{i}]</div>
              </div>
            )
          })}
          {heap.length === 0 && <span className="text-gray-600 text-sm italic">empty</span>}
        </div>
      </div>

      {/* Formula hint */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500 font-mono">
        <span>parent(i) = ⌊(i-1)/2⌋</span>
        <span>left(i) = 2i+1</span>
        <span>right(i) = 2i+2</span>
      </div>
    </div>
  )
}
