// Tries — prefix tree with insert / search / prefix-match.
//
// Interactive:
//   - Type in the prefix box and the current walk lights up node
//     by node in real time.
//   - Add / remove words from the trie.
//   - Prefix search returns every word under the current node.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard,
  Field, TextInput, Chip,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { TRIES_CODE } from './code/Tries'

/* ---------- trie ops ---------- */

const mkTrieNode = () => ({ children: {}, terminal: false })

function trieInsert(root, word) {
  const w = word.toLowerCase()
  let cur = root
  for (const ch of w) {
    if (!cur.children[ch]) cur.children[ch] = mkTrieNode()
    cur = cur.children[ch]
  }
  cur.terminal = true
}
function trieHas(root, word) {
  const w = word.toLowerCase()
  let cur = root
  for (const ch of w) {
    if (!cur.children[ch]) return false
    cur = cur.children[ch]
  }
  return cur.terminal
}
function trieRemove(root, word) {
  const w = word.toLowerCase()
  const path = [root]
  for (const ch of w) {
    const nxt = path[path.length - 1].children[ch]
    if (!nxt) return
    path.push(nxt)
  }
  path[path.length - 1].terminal = false
  for (let i = w.length; i >= 1; i--) {
    const child = path[i], parent = path[i - 1]
    if (!child.terminal && Object.keys(child.children).length === 0) delete parent.children[w[i - 1]]
  }
}
function trieWalk(root, prefix) {
  const p = prefix.toLowerCase()
  const path = [root]
  for (const ch of p) {
    const nxt = path[path.length - 1].children[ch]
    if (!nxt) return { path, matched: false }
    path.push(nxt)
  }
  return { path, matched: true }
}
function collect(node, prefix = '') {
  const out = []
  if (node.terminal) out.push(prefix)
  for (const [ch, c] of Object.entries(node.children)) out.push(...collect(c, prefix + ch))
  return out.sort()
}

/* ---------- layout ---------- */

function layout(root) {
  const H_GAP = 42, V_GAP = 60
  const positions = []
  const measure = (n) => {
    const kids = Object.entries(n.children).map(([k, c]) => ({ k, ...measure(c) }))
    const w = kids.length === 0 ? 1 : kids.reduce((a, b) => a + b.w, 0)
    return { node: n, kids, w }
  }
  const m = measure(root)
  function place(m, xOff, depth, key) {
    let cursor = xOff
    const positioned = m.kids.map(k => {
      const cx = place(k, cursor, depth + 1, k.k)
      const cw = k.w * H_GAP
      cursor += cw
      return { k: k.k, x: cx }
    })
    const cx = m.kids.length === 0
      ? xOff + H_GAP / 2
      : (positioned[0].x + positioned[positioned.length - 1].x) / 2
    positions.push({
      node: m.node, key, x: cx, y: depth * V_GAP + 30,
      childKeys: m.kids.map(k => k.k),
    })
    return cx
  }
  place(m, 20, 0, '·')
  return { positions, totalW: Math.max(320, m.w * H_GAP + 20) }
}

/* ---------- render ---------- */

function TrieSVG({ root, walkPath, activeIdx }) {
  const { positions, totalW } = useMemo(() => layout(root), [root])
  const byNode = new Map(positions.map(p => [p.node, p]))
  const h = Math.max(160, Math.max(...positions.map(p => p.y)) + 30)
  const highlighted = new Set(walkPath.slice(0, activeIdx + 1))
  return (
    <svg viewBox={`0 0 ${totalW} ${h}`} className="w-full">
      {positions.map(p => p.childKeys.map(k => {
        const child = byNode.get(p.node.children[k])
        if (!child) return null
        const edgeActive = highlighted.has(p.node) && highlighted.has(child)
        return (
          <g key={`e-${p.x}-${p.y}-${k}`}>
            <line x1={p.x} y1={p.y} x2={child.x} y2={child.y}
                  stroke={edgeActive ? '#fbbf24' : '#4b5563'} strokeWidth={edgeActive ? 2 : 1.4} />
            <text x={(p.x + child.x) / 2} y={(p.y + child.y) / 2 - 4} fontSize={9}
                  textAnchor="middle" fill={edgeActive ? '#fbbf24' : '#9ca3af'} fontFamily="ui-monospace">
              {k}
            </text>
          </g>
        )
      }))}
      {positions.map(p => {
        const isActive = highlighted.has(p.node) && p.node === walkPath[activeIdx]
        const onPath = highlighted.has(p.node) && !isActive
        const term = p.node.terminal
        const tone = isActive ? { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7' }
                  : onPath   ? { fill: '#4c1d95', stroke: '#a78bfa', text: '#ede9fe' }
                  : term     ? { fill: '#064e3b', stroke: '#34d399', text: '#d1fae5' }
                  : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
        return (
          <motion.g key={`n-${p.x}-${p.y}-${p.key}`} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
            <circle r={13} fill={tone.fill} stroke={tone.stroke} strokeWidth={2} />
            {term && <circle r={17} fill="none" stroke="#34d399" strokeWidth={1} strokeDasharray="2 2" />}
            <text y={4} textAnchor="middle" fontSize={10} fill={tone.text} fontFamily="ui-monospace">
              {p.key === '·' ? '·' : p.key}
            </text>
          </motion.g>
        )
      })}
    </svg>
  )
}

const SEEDS = ['app', 'apple', 'apply', 'ape', 'bat', 'batch', 'bad', 'bar', 'cat', 'car', 'carbon']

export default function Tries() {
  const [root, setRoot] = useState(() => {
    const r = mkTrieNode()
    for (const w of SEEDS) trieInsert(r, w)
    return r
  })
  const [prefix, setPrefix] = useState('app')
  const [word, setWord] = useState('cake')

  const walk = useMemo(() => trieWalk(root, prefix), [root, prefix])
  const activeIdx = walk.path.length - 1
  const suggestions = walk.matched ? collect(walk.path[walk.path.length - 1], prefix.toLowerCase()) : []
  const exists = trieHas(root, prefix)

  const doInsert = () => { const r = root; trieInsert(r, word); setRoot({ ...r }) }
  const doRemove = () => { const r = root; trieRemove(r, word); setRoot({ ...r }) }
  const doReset = () => {
    const r = mkTrieNode(); for (const w of SEEDS) trieInsert(r, w); setRoot(r); setPrefix('app')
  }

  return (
    <><ExplanationBlock>
        <p>
          A <b>trie</b> (retrieval tree) stores a set of strings so that any
          prefix walk goes through the same nodes. Each edge is a character;
          each node marked <b>terminal</b> represents the end of a word.
          Because every word with a given prefix shares the same path from
          the root, prefix queries take O(|p|) time regardless of how many
          words are stored.
        </p>
        <p>
          Type in the prefix box — the walk lights up node by node as
          you extend the prefix. The dashed green ring marks terminal nodes
          (whole words). If a character breaks the path, the walk stops and
          the badge turns red — that prefix doesn't exist in the trie.
        </p>
        <p>
          Space is the trade-off: naively, each internal node is a hashmap
          of ~26 children, so memory can balloon. Real production tries use
          arrays of size 26 for ASCII, or radix trees / crit-bit trees that
          collapse chains of single-child nodes.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <TrieSVG root={root} walkPath={walk.path} activeIdx={activeIdx} />
          <div className="mt-3 flex gap-2 flex-wrap justify-center">
            <Chip tone={walk.matched ? 'emerald' : 'rose'}>
              prefix {walk.matched ? 'in trie' : 'broken'}
            </Chip>
            <Chip tone={exists ? 'amber' : 'gray'}>
              {exists ? 'whole word' : 'not a whole word'}
            </Chip>
            <Chip tone="fuchsia">{suggestions.length} completions</Chip>
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2 max-h-32 overflow-auto">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Autocomplete under "{prefix}"</div>
            <div className="flex flex-wrap gap-1">
              {suggestions.length === 0 && <span className="text-xs text-gray-600">no words</span>}
              {suggestions.map(w => (
                <span key={w} className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-emerald-200">{w}</span>
              ))}
            </div>
          </div>
        </VizPanel>

        <ControlsPanel>
          <Field label="Prefix (live)" helper="Walk lights up as you type.">
            <TextInput value={prefix} onChange={setPrefix} placeholder="ap" />
          </Field>
          <Field label="Word" helper="For insert / remove.">
            <TextInput value={word} onChange={setWord} placeholder="carbon" />
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button variant="primary" size="small" onClick={doInsert}>+ insert</Button>
              <Button variant="danger" size="small" onClick={doRemove}>- remove</Button>
            </div>
          </Field>
          <Button variant="subtle" size="small" onClick={doReset}>Reset trie</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title="Implementation — trie insert / search"
        code={TRIES_CODE}
        activeLines={{ pseudo: activeIdx > 0 ? 5 : -1 }}
      />

      <ComplexityTable rows={[
        { op: 'insert word',   best: 'O(m)', avg: 'O(m)', worst: 'O(m)', space: 'O(m \\cdot \\Sigma)' },
        { op: 'search word',   best: 'O(m)', avg: 'O(m)', worst: 'O(m)', space: 'O(m \\cdot \\Sigma)' },
        { op: 'prefix match',  best: 'O(m)', avg: 'O(m)', worst: 'O(m)', space: 'O(m \\cdot \\Sigma)' },
        { op: 'list completions', best: 'O(k)', avg: 'O(k)', worst: 'O(k)', space: 'O(m \\cdot \\Sigma)' },
      ]} />

      <RealWorldCard>
        <p>
          Every autocomplete UI ever (Google, VS Code IntelliSense, phone
          keyboards) is a trie or an FST derived from one. IP routing tables
          in kernels are compressed radix tries — "longest matching prefix"
          is exactly a trie walk. Regex engines compile character classes to
          tries. Aho-Corasick multi-pattern matching (used by grep, ClamAV,
          Snort) builds a trie of patterns and adds failure links for
          O(n + z) matching.
        </p>
      </RealWorldCard></>
  )
}
