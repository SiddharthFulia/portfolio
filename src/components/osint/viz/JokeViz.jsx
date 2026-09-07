// JokeViz — joke (icanhazdadjoke).
//
// Payload: { id, joke, status }. We render the joke as a speech-bubble card.

import { CollapseRawJson } from './_shared.jsx'

export default function JokeViz({ data }) {
  if (!data?.joke) return null
  return (
    <div>
      <div className='relative bg-gradient-to-br from-amber-400/10 to-rose-500/5 border border-amber-400/20 rounded-2xl p-4'>
        <div className='absolute -top-2 left-6 w-4 h-4 rotate-45 bg-amber-400/10 border-l border-t border-amber-400/20' />
        <div className='text-4xl leading-none text-amber-300/40 select-none absolute top-1 right-3'>&ldquo;</div>
        <p className='text-white text-sm sm:text-base leading-relaxed'>{data.joke}</p>
      </div>
      <div className='mt-2 text-[10px] text-gray-500 font-mono'>id · {data.id}</div>
      <CollapseRawJson data={data} />
    </div>
  )
}
