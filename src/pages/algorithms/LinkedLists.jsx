// Linked Lists — singly + doubly with pointer-rerouting animation.
//
// Interactive:
//   - insert head / tail / at index
//   - delete at index
//   - reverse (singly) / swap prev-next pointers (doubly)
//   - toggle singly <-> doubly to see the extra backward arrow
//
// Correctness notes:
//   - "Reverse" for singly uses the three-pointer walk
//     (prev / curr / next). We emit a frame per iteration so the
//     user can watch the direction flip one node at a time.
//   - Doubly-linked delete correctly rewires both prev.next and
//     next.prev; head/tail edges are handled explicitly.

import { useMemo, useState } from 'react'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { motion } from 'framer-motion'
import { LL_INSERT_CODE, LL_REVERSE_CODE } from './code/LinkedLists'

/* ---------- data model ----------
   Store list as a flat array of {id, value} nodes and a separate
   `links` map from id → {next, prev} so we can rewire pointers
   without moving DOM nodes around. That's how you get the smooth
   arrow-flip animation: the boxes stay put, only the arrows move. */

let NODE_ID = 1
const mk = (v) => ({ id: NODE_ID++, v })

function toArray(nodes, links, headId) {
  const out = []
  let cur = headId
  const guard = new Set()
  while (cur != null && !guard.has(cur)) {
    guard.add(cur)
    const n = nodes.find(n => n.id === cur)
    if (!n) break
    out.push(n)
    cur = links[cur]?.next ?? null
  }
  return out
}

function snap(nodes, links, headId, msg, touch) {
  return { nodes: nodes.map(n => ({ ...n })), links: JSON.parse(JSON.stringify(links)), headId, msg, touch }
}

function planInsert(nodes, links, headId, doubly, idx, value) {
  const nn = mk(value)
  const newNodes = [...nodes, nn]
  const newLinks = { ...links, [nn.id]: { next: null, prev: null } }
  const frames = []
  frames.push(snap(newNodes, newLinks, headId, `insert ${value} at index ${idx}`, nn.id))
  const list = toArray(nodes, links, headId)
  if (idx <= 0 || list.length === 0) {
    // head insert
    newLinks[nn.id].next = headId
    if (doubly && headId != null) newLinks[headId] = { ...newLinks[headId], prev: nn.id }
    frames.push(snap(newNodes, newLinks, nn.id, `new node → head`, nn.id))
    return { frames, headId: nn.id, nodes: newNodes, links: newLinks }
  }
  if (idx >= list.length) {
    // tail insert
    const tail = list[list.length - 1]
    newLinks[tail.id] = { ...newLinks[tail.id], next: nn.id }
    if (doubly) newLinks[nn.id].prev = tail.id
    frames.push(snap(newNodes, newLinks, headId, `tail.next → new node`, nn.id))
    return { frames, headId, nodes: newNodes, links: newLinks }
  }
  // middle: after list[idx-1], before list[idx]
  const before = list[idx - 1]
  const after = list[idx]
  newLinks[before.id] = { ...newLinks[before.id], next: nn.id }
  newLinks[nn.id].next = after.id
  if (doubly) {
    newLinks[nn.id].prev = before.id
    newLinks[after.id] = { ...newLinks[after.id], prev: nn.id }
  }
  frames.push(snap(newNodes, newLinks, headId, `rewire before.next & new.next`, nn.id))
  return { frames, headId, nodes: newNodes, links: newLinks }
}

function planDelete(nodes, links, headId, doubly, idx) {
  const list = toArray(nodes, links, headId)
  const frames = []
  if (idx < 0 || idx >= list.length) {
    return { frames: [snap(nodes, links, headId, `index out of bounds`)], headId, nodes, links }
  }
  const target = list[idx]
  const before = idx > 0 ? list[idx - 1] : null
  const after = list[idx + 1] || null
  frames.push(snap(nodes, links, headId, `delete node ${target.v} at index ${idx}`, target.id))
  const newLinks = JSON.parse(JSON.stringify(links))
  if (before) {
    newLinks[before.id].next = after?.id ?? null
    if (doubly && after) newLinks[after.id].prev = before.id
    frames.push(snap(nodes, newLinks, headId, `before.next skips target`, before.id))
  } else {
    // deleting head
    if (doubly && after) newLinks[after.id].prev = null
    frames.push(snap(nodes, newLinks, after?.id ?? null, `head → ${after?.v ?? 'null'}`, after?.id))
    const newNodes = nodes.filter(n => n.id !== target.id)
    delete newLinks[target.id]
    return { frames, headId: after?.id ?? null, nodes: newNodes, links: newLinks }
  }
  const newNodes = nodes.filter(n => n.id !== target.id)
  delete newLinks[target.id]
  frames.push(snap(newNodes, newLinks, headId, `free target node`, before?.id))
  return { frames, headId, nodes: newNodes, links: newLinks }
}

function planReverse(nodes, links, headId, doubly) {
  const frames = []
  frames.push(snap(nodes, links, headId, `reverse — three-pointer walk`))
  let prev = null
  let curr = headId
  const newLinks = JSON.parse(JSON.stringify(links))
  while (curr != null) {
    const nxt = newLinks[curr].next
    newLinks[curr].next = prev
    if (doubly) newLinks[curr].prev = nxt
    frames.push(snap(nodes, newLinks, headId, `flip ${nodes.find(n => n.id === curr).v}.next → ${prev == null ? 'null' : nodes.find(n => n.id === prev).v}`, curr))
    prev = curr
    curr = nxt
  }
  frames.push(snap(nodes, newLinks, prev, `head → ${prev == null ? 'null' : nodes.find(n => n.id === prev).v}`, prev))
  return { frames, headId: prev, nodes, links: newLinks }
}

/* ---------- render ---------- */

function ListViz({ frame, doubly }) {
  if (!frame) return null
  const list = toArray(frame.nodes, frame.links, frame.headId)
  const W = 92
  return (
    <div className="w-full min-h-[240px] flex flex-col items-center justify-center py-6">
      {list.length === 0 && <div className="text-gray-500 text-sm">empty list — head → null</div>}
      <div className="flex items-center gap-0 flex-wrap justify-center">
        {list.map((n, i) => {
          const isTouch = n.id === frame.touch
          return (
            <div key={n.id} className="flex items-center">
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                className="relative border rounded-lg flex items-center justify-center font-mono text-sm"
                style={{
                  width: W,
                  height: 52,
                  background: isTouch ? '#78350f' : '#111827',
                  borderColor: isTouch ? '#fbbf24' : '#4b5563',
                  boxShadow: isTouch ? '0 0 22px rgba(251,191,36,0.45)' : 'none',
                }}
              >
                <div className="flex items-baseline gap-1">
                  <span className={isTouch ? 'text-amber-100' : 'text-gray-100'}>{n.v}</span>
                  <span className="text-[9px] text-gray-500">#{i}</span>
                </div>
              </motion.div>
              {i < list.length - 1 && (
                <div className="flex flex-col items-center px-1">
                  <span className="text-gray-500">→</span>
                  {doubly && <span className="text-gray-500 -mt-1">←</span>}
                </div>
              )}
            </div>
          )
        })}
        {list.length > 0 && (
          <div className="ml-2 text-gray-500 font-mono text-xs">→ null</div>
        )}
      </div>
      <div className="mt-4 flex gap-2 flex-wrap justify-center">
        <Chip tone="amber">head: {list[0]?.v ?? 'null'}</Chip>
        <Chip tone="fuchsia">tail: {list[list.length - 1]?.v ?? 'null'}</Chip>
        <Chip tone={doubly ? 'cyan' : 'gray'}>{doubly ? 'doubly' : 'singly'}</Chip>
        <Chip tone="emerald">length: {list.length}</Chip>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export default function LinkedLists() {
  const [doubly, setDoubly] = useState(false)
  const [nodes, setNodes] = useState(() => {
    NODE_ID = 1
    return [mk(3), mk(8), mk(15), mk(21)]
  })
  const [links, setLinks] = useState(() => ({
    1: { next: 2, prev: null },
    2: { next: 3, prev: 1 },
    3: { next: 4, prev: 2 },
    4: { next: null, prev: 3 },
  }))
  const [headId, setHeadId] = useState(1)

  const [insertIdx, setInsertIdx] = useState('1')
  const [insertVal, setInsertVal] = useState('42')
  const [delIdx, setDelIdx] = useState('2')

  const [frames, setFrames] = useState([snap(nodes, links, headId, 'ready')])
  const [mode, setMode] = useState('insert') // insert | reverse
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (mode === 'reverse') {
      if (current.msg.includes('three-pointer')) return 0
      if (current.msg.includes('flip')) return 5
      if (current.msg.includes('head →')) return 8
      return -1
    }
    if (current.msg.includes('insert')) return 0
    if (current.msg.includes('head')) return 3
    if (current.msg.includes('rewire')) return 9
    if (current.msg.includes('tail.next')) return 9
    return -1
  }, [current, mode])

  const commit = (plan) => {
    setFrames(plan.frames)
    setNodes(plan.nodes)
    setLinks(plan.links)
    setHeadId(plan.headId)
    engine.reset()
  }

  const doInsert = () => {
    setMode('insert')
    commit(planInsert(nodes, links, headId, doubly, Number(insertIdx), Number(insertVal)))
  }
  const doDelete = () => {
    setMode('insert')
    commit(planDelete(nodes, links, headId, doubly, Number(delIdx)))
  }
  const doReverse = () => {
    setMode('reverse')
    commit(planReverse(nodes, links, headId, doubly))
  }
  const doReset = () => {
    NODE_ID = 5
    const ns = [ {id:1,v:3},{id:2,v:8},{id:3,v:15},{id:4,v:21} ]
    const ls = {
      1:{next:2,prev:null}, 2:{next:3,prev:1},
      3:{next:4,prev:2}, 4:{next:null,prev:3},
    }
    setNodes(ns); setLinks(ls); setHeadId(1)
    setFrames([snap(ns, ls, 1, 'reset')])
    engine.reset()
  }

  return (
    <><ExplanationBlock>
        <p>
          A linked list stores each element in its own <b>node</b> along with a{' '}
          <b>pointer</b> to the next node. The nodes don't have to live next to
          each other in memory — that's the whole point. Insertions and
          deletions in the middle become O(1) once you already have a pointer to
          the neighbour, because you're just rewiring two arrows.
        </p>
        <p>
          The cost you pay: <b>no random access</b>. To read the k-th element
          you have to walk k pointers. And every extra pointer means bad cache
          behaviour — the CPU can't prefetch nodes that live at random addresses.
          A well-tuned array will out-run a linked list on most modern hardware
          unless the workload is genuinely dominated by mid-list mutations.
        </p>
        <p>
          <b>Singly vs doubly:</b> a doubly-linked list also stores a{' '}
          <code>prev</code> pointer, which makes deletion O(1) once you have the
          node (you don't need to walk from the head to find its predecessor).
          Every OS process queue, most LRU caches, and the browser's DOM
          document (children as siblings) are doubly-linked.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Invariant:</b> exactly one node has <code>prev == null</code> (head) and one has <code>next == null</code> (tail); every other pointer chain leads to the tail.</li>
          <li><b>Edge cases:</b> deleting the head means updating the head reference; a doubly-linked delete has to fix both neighbours.</li>
        </ul>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <ListViz frame={current} doubly={doubly} />
          <div className="mt-3 text-xs text-gray-400 text-center min-h-[16px]">{current?.msg}</div>
          <div className="mt-3">
            <OperationLog frames={frames} activeFrame={engine.i} />
          </div>
        </VizPanel>

        <ControlsPanel>
          <StepControls
            playing={engine.playing}
            onPlay={engine.play}
            onPause={engine.pause}
            onStep={engine.step}
            onReset={engine.reset}
            speed={engine.speed}
            onSpeed={engine.setSpeed}
          />
          <div className="h-px bg-white/10 my-1" />

          <Field label="List type" helper="Doubly stores an extra prev pointer.">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant={doubly ? 'ghost' : 'primary'} size="small" onClick={() => setDoubly(false)}>Singly</Button>
              <Button variant={doubly ? 'primary' : 'ghost'} size="small" onClick={() => setDoubly(true)}>Doubly</Button>
            </div>
          </Field>

          <Field label="Insert" helper="0 = head, length = tail.">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={insertIdx} onChange={setInsertIdx} placeholder="index" />
              <TextInput value={insertVal} onChange={setInsertVal} placeholder="value" />
            </div>
            <Button variant="primary" size="small" onClick={doInsert} className="mt-1.5 w-full">Insert</Button>
          </Field>

          <Field label="Delete" helper="Rewires the neighbour(s).">
            <TextInput value={delIdx} onChange={setDelIdx} placeholder="index" />
            <Button variant="danger" size="small" onClick={doDelete} className="mt-1.5 w-full">Delete at index</Button>
          </Field>

          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="accent" size="small" onClick={doReverse}>Reverse</Button>
            <Button variant="subtle" size="small" onClick={doReset}>Reset</Button>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title={mode === 'reverse' ? 'Implementation — reverse (singly)' : 'Implementation — insertAt (singly)'}
        code={mode === 'reverse' ? LL_REVERSE_CODE : LL_INSERT_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'access k-th', best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'insert head', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'insert tail', best: 'O(1)', avg: 'O(1)^*', worst: 'O(n)', space: 'O(n)' },
        { op: 'delete (have node)', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'reverse', best: 'O(n)', avg: 'O(n)', worst: 'O(n)', space: 'O(1)' },
      ]} />

      <RealWorldCard>
        <p>
          Doubly-linked lists back the browser's DOM sibling structure, the
          Linux kernel's task queues (<code>list_head</code>), and most LRU
          caches — the ability to unlink an arbitrary node in O(1) is exactly
          what a cache eviction path needs. Singly-linked lists show up in
          Lisp/Scheme cons cells, functional immutable structures (linked
          "spines" over persistent trees), and hash-table separate chaining.
        </p>
      </RealWorldCard></>
  )
}
