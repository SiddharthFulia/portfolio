// GenericViz — fallback for tools without a hand-crafted viz.
//
// Walks the top level of the JSON tree and renders each primitive-valued
// field as a KV row. Arrays and objects get short summaries + a link into the
// raw JSON footer. Keeps unmapped tools legible without hard-coding a viz.

import { KV, KVGrid, CollapseRawJson } from './_shared.jsx'

function summarise(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 77) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.length} items]`
  if (typeof v === 'object') return `{${Object.keys(v).length} keys}`
  return String(v)
}

export default function GenericViz({ data }) {
  if (data == null) return null
  // Primitive at the top level — just show it.
  if (typeof data !== 'object' || Array.isArray(data)) {
    return (
      <div>
        <div className='text-white text-xs font-mono break-all bg-white/[0.03] rounded p-2 max-h-40 overflow-auto'>
          {typeof data === 'string' ? data : JSON.stringify(data, null, 2).slice(0, 400)}
        </div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  const entries = Object.entries(data).slice(0, 12)
  return (
    <div>
      <div className='text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1'>Response</div>
      <KVGrid>
        {entries.map(([k, v]) => (
          <KV key={k} label={k} value={summarise(v)} />
        ))}
      </KVGrid>
      {Object.keys(data).length > entries.length && (
        <div className='text-[10px] text-gray-500 mt-1'>+ {Object.keys(data).length - entries.length} more fields — see raw JSON below</div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
