// UrbanViz — urban.
//
// Returns { list: [{ word, definition, example, thumbs_up, thumbs_down, author }] }.
// We take the top-voted entry.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

function clean(str) {
  // Urban Dictionary sprinkles [square-bracket cross-links] into text. Strip
  // the brackets so we don't render "[api]" everywhere.
  return String(str || '').replace(/\[|\]/g, '')
}

export default function UrbanViz({ data }) {
  const top = (data?.list || [])[0]
  if (!top) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>No definitions found.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  return (
    <div>
      <HeroLine
        eyebrow='Urban Dictionary'
        value={top.word}
        sub={top.author ? `by ${top.author}` : null}
        right={<div className='flex gap-1'><Chip tone='emerald'>↑ {top.thumbs_up}</Chip><Chip tone='rose'>↓ {top.thumbs_down}</Chip></div>}
      />
      <blockquote className='relative border-l-2 border-amber-400/40 pl-3 py-1 text-gray-200 text-xs leading-relaxed'>
        {clean(top.definition)}
      </blockquote>
      {top.example && (
        <div className='mt-2 text-gray-500 text-xs italic leading-relaxed'>
          “{clean(top.example)}”
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
