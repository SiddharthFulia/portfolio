// MxViz — mxrecords.
//
// Cloudflare DoH returns { Answer: [{ name, type, TTL, data }] } where `data`
// is a "priority hostname." field. We split it, sort by priority ascending,
// and render each row as a priority pill + hostname.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

function parseMx(d) {
  const answers = d?.Answer || []
  return answers
    .map((a) => {
      const [prio, host] = String(a.data || '').split(/\s+/)
      return { priority: parseInt(prio, 10) || 0, host: (host || '').replace(/\.$/, ''), ttl: a.TTL }
    })
    .sort((a, b) => a.priority - b.priority)
}

export default function MxViz({ data }) {
  const rows = parseMx(data)
  return (
    <div>
      <HeroLine
        eyebrow='MX records'
        value={rows.length ? `${rows.length} mail server${rows.length === 1 ? '' : 's'}` : 'No MX records'}
        right={data?.Status === 0 && <Chip tone='emerald'>OK</Chip>}
      />
      {rows.length === 0 ? (
        <div className='text-gray-500 text-xs'>Domain resolves but no MX records are published — check spelling.</div>
      ) : (
        <div className='space-y-1'>
          {rows.map((r, i) => (
            <div key={`${r.host}-${i}`} className='flex items-center gap-2 bg-white/[0.02] rounded px-2 py-1.5 text-xs'>
              <span className='inline-block w-8 text-center text-[10px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded'>
                {r.priority}
              </span>
              <span className='font-mono text-white flex-1 truncate' title={r.host}>{r.host || '—'}</span>
              <span className='text-gray-500 text-[10px]'>TTL {r.ttl}s</span>
            </div>
          ))}
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
