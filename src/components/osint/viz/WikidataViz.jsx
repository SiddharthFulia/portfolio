// WikidataViz — wikidata search.
//
// Payload from wbsearchentities: { search: [{ id, label, description, url }] }.
// We render the top hit as a hero + up to 5 more matches as compact rows.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

export default function WikidataViz({ data }) {
  const results = data?.search || []
  const top = results[0]
  if (!top) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>No Wikidata entities matched.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  return (
    <div>
      <HeroLine
        eyebrow='Wikidata'
        value={<><span className='font-mono text-amber-300'>{top.id}</span> · {top.label}</>}
        sub={top.description}
        right={<Chip tone='amber'>#1</Chip>}
      />
      {results.length > 1 && (
        <div className='space-y-1 mt-2'>
          {results.slice(1, 6).map((r) => (
            <div key={r.id} className='flex items-baseline gap-2 text-xs'>
              <span className='font-mono text-amber-300/70 w-16 shrink-0'>{r.id}</span>
              <span className='text-white truncate'>{r.label}</span>
              <span className='text-gray-500 truncate hidden sm:inline'>{r.description}</span>
            </div>
          ))}
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
