import { useState, useRef, useCallback } from 'react'

const EXAMPLES = [
  {
    label: 'Fibonacci (recursive vs memoized)',
    code: `// Fibonacci: recursive vs memoized
function fibRecursive(n) {
  if (n <= 1) return n
  return fibRecursive(n - 1) + fibRecursive(n - 2)
}

function fibMemo(n, memo = {}) {
  if (n in memo) return memo[n]
  if (n <= 1) return n
  memo[n] = fibMemo(n - 1, memo) + fibMemo(n - 2, memo)
  return memo[n]
}

const n = 35
console.log('Computing fib(' + n + ')...')

const t1 = performance.now()
const r1 = fibRecursive(n)
console.log('Recursive result:', r1, '| time: ~slow')

const t2 = performance.now()
const r2 = fibMemo(n)
const t3 = performance.now()
console.log('Memoized result:', r2, '| time:', (t3 - t2).toFixed(4) + 'ms')
console.log('First 10:', Array.from({length:10}, (_,i) => fibMemo(i)))`,
  },
  {
    label: 'Binary Search',
    code: `// Binary Search implementation
function binarySearch(arr, target) {
  let left = 0, right = arr.length - 1, steps = 0
  while (left <= right) {
    steps++
    const mid = Math.floor((left + right) / 2)
    console.log('  Step', steps + ': checking index', mid, '→ value', arr[mid])
    if (arr[mid] === target) return { index: mid, steps }
    if (arr[mid] < target) left = mid + 1
    else right = mid - 1
  }
  return { index: -1, steps }
}

const arr = Array.from({ length: 20 }, (_, i) => i * 3)
console.log('Array:', arr.join(', '))

const target = 33
console.log('\\nSearching for', target + ':')
const result = binarySearch(arr, target)
console.log(result.index !== -1
  ? 'Found at index ' + result.index + ' in ' + result.steps + ' steps'
  : 'Not found after ' + result.steps + ' steps')

console.log('\\nSearching for 100:')
const r2 = binarySearch(arr, 100)
console.log('Not found after', r2.steps, 'steps (array has', arr.length, 'elements)')`,
  },
  {
    label: 'Quicksort with step counter',
    code: `// Quicksort with step counter
let comparisons = 0, swaps = 0

function quicksort(arr, lo = 0, hi = arr.length - 1) {
  if (lo < hi) {
    const pi = partition(arr, lo, hi)
    quicksort(arr, lo, pi - 1)
    quicksort(arr, pi + 1, hi)
  }
  return arr
}

function partition(arr, lo, hi) {
  const pivot = arr[hi]
  let i = lo - 1
  for (let j = lo; j < hi; j++) {
    comparisons++
    if (arr[j] <= pivot) {
      i++
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      swaps++
    }
  }
  ;[arr[i + 1], arr[hi]] = [arr[hi], arr[i + 1]]
  swaps++
  return i + 1
}

const arr = [64, 34, 25, 12, 22, 11, 90, 47, 3, 78, 55, 31]
console.log('Input:', arr.join(', '))
const sorted = quicksort([...arr])
console.log('Sorted:', sorted.join(', '))
console.log('Comparisons:', comparisons)
console.log('Swaps:', swaps)
console.log('Array length:', arr.length, '| O(n log n) ≈', Math.round(arr.length * Math.log2(arr.length)))`,
  },
  {
    label: 'Palindrome checker',
    code: `// Check if string is a palindrome (handles Unicode, spaces, punctuation)
function isPalindrome(str) {
  const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '')
  return clean === clean.split('').reverse().join('')
}

function isPalindromePointer(str) {
  const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '')
  let l = 0, r = clean.length - 1
  while (l < r) {
    if (clean[l] !== clean[r]) return false
    l++; r--
  }
  return true
}

const tests = [
  'racecar',
  'A man, a plan, a canal: Panama',
  'Was it a car or a cat I saw?',
  'hello world',
  'No lemon, no melon',
  'Never odd or even',
  'JavaScript',
  '12321',
  '12345',
]

console.log('Palindrome tests:')
tests.forEach(t => {
  const result = isPalindromePointer(t)
  console.log((result ? '✓' : '✗') + ' "' + t + '"')
})`,
  },
  {
    label: 'Flatten nested array',
    code: `// Flatten nested arrays — multiple approaches
function flattenRecursive(arr) {
  return arr.reduce((acc, val) =>
    Array.isArray(val) ? acc.concat(flattenRecursive(val)) : [...acc, val], [])
}

function flattenIterative(arr) {
  const stack = [...arr]
  const result = []
  while (stack.length) {
    const item = stack.pop()
    if (Array.isArray(item)) stack.push(...item)
    else result.unshift(item)
  }
  return result
}

function flattenDepth(arr, depth = 1) {
  if (depth === 0) return arr.slice()
  return arr.reduce((acc, val) =>
    Array.isArray(val) ? acc.concat(flattenDepth(val, depth - 1)) : [...acc, val], [])
}

const nested = [1, [2, 3], [4, [5, 6]], [7, [8, [9, [10]]]]]
console.log('Input:    ', JSON.stringify(nested))
console.log('Recursive:', JSON.stringify(flattenRecursive(nested)))
console.log('Iterative:', JSON.stringify(flattenIterative(nested)))
console.log('Depth 1:  ', JSON.stringify(flattenDepth(nested, 1)))
console.log('Depth 2:  ', JSON.stringify(flattenDepth(nested, 2)))
console.log('Built-in: ', JSON.stringify(nested.flat(Infinity)))`,
  },
]

function runCode(code) {
  const logs = []
  const pushLog = (type, args) => {
    const parts = args.map(a => {
      if (typeof a === 'string') return a
      if (typeof a === 'number' || typeof a === 'boolean') return String(a)
      try { return JSON.stringify(a, null, 0) } catch { return String(a) }
    })
    logs.push({ type, text: parts.join(' ') })
  }
  const fakeConsole = {
    log: (...args) => pushLog('log', args),
    error: (...args) => pushLog('error', args),
    warn: (...args) => pushLog('warn', args),
  }
  const t0 = performance.now()
  try {
    // eslint-disable-next-line no-new-func
    new Function('console', 'performance', code)(fakeConsole, performance)
    return { logs, time: (performance.now() - t0).toFixed(3), error: null }
  } catch (e) {
    logs.push({ type: 'error', text: e.message })
    return { logs, time: (performance.now() - t0).toFixed(3), error: e.message }
  }
}

function colorLine(text, type) {
  if (type === 'error') return <span className="text-red-400">{text}</span>
  if (type === 'warn')  return <span className="text-yellow-400">{text}</span>
  // colorize numbers and strings
  const parts = []
  const regex = /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b|\bundefined\b)/g
  let last = 0
  let m
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={last} className="text-gray-300">{text.slice(last, m.index)}</span>)
    if (m[1] || m[2]) parts.push(<span key={m.index} className="text-green-400">{m[0]}</span>)
    else if (m[3])    parts.push(<span key={m.index} className="text-cyan-400">{m[0]}</span>)
    else if (m[4])    parts.push(<span key={m.index} className="text-purple-400">{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={last} className="text-gray-300">{text.slice(last)}</span>)
  return parts.length > 0 ? parts : <span className="text-gray-300">{text}</span>
}

export default function CodeRunner() {
  const [code, setCode] = useState(EXAMPLES[0].code)
  const [output, setOutput] = useState(null)
  const textareaRef = useRef(null)

  const execute = useCallback(() => {
    if (!code.trim()) return
    setOutput(runCode(code))
  }, [code])

  const onKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); execute() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const newVal = code.substring(0, start) + '  ' + code.substring(e.target.selectionEnd)
      setCode(newVal)
      requestAnimationFrame(() => { if (textareaRef.current) { textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2 } })
    }
  }

  const lines = code.split('\n')

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white">
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <select
          onChange={e => { const ex = EXAMPLES.find(x => x.label === e.target.value); if (ex) setCode(ex.code) }}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-cyan-600 font-mono"
          defaultValue="">
          <option value="" disabled>Load example…</option>
          {EXAMPLES.map(ex => <option key={ex.label} value={ex.label}>{ex.label}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setCode(''); setOutput(null) }}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg font-semibold transition-colors">Clear</button>
          <button onClick={execute}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-semibold transition-colors">Run</button>
          <span className="text-gray-600 text-xs font-mono self-center">Ctrl+Enter</span>
        </div>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-gray-700 bg-gray-950 mb-4">
        <div className="py-3 px-2 bg-gray-900/80 border-r border-gray-800 select-none min-w-[2.5rem] text-right">
          {lines.map((_, i) => (
            <div key={i} className="text-gray-600 font-mono text-xs leading-5 px-1">{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          rows={Math.max(lines.length, 8)}
          className="flex-1 bg-transparent px-4 py-3 font-mono text-sm text-cyan-100 focus:outline-none resize-y leading-5"
          style={{ minHeight: 200 }}
        />
      </div>

      {output && (
        <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-800/60 px-4 py-2 flex items-center justify-between border-b border-gray-700">
            <span className="text-gray-400 text-xs font-mono uppercase tracking-wide">Output</span>
            <span className="text-gray-500 text-xs font-mono">{output.time}ms · {output.logs.length} line{output.logs.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-4 font-mono text-sm leading-6 max-h-72 overflow-y-auto">
            {output.logs.length === 0 && <span className="text-gray-600">No output</span>}
            {output.logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {colorLine(log.text, log.type)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
