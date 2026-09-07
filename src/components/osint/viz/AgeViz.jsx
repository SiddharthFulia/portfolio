// AgeViz — agify.
//
// Agify only returns a single "age" number — no histogram. We synthesise a
// tiny bell-ish sparkline centred on the predicted age purely for visual
// interest, then footer the raw payload.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

export default function AgeViz({ data }) {
  if (!data) return null
  const age = data.age
  const bins = [15, 25, 35, 45, 55, 65, 75]
  return (
    <div>
      <HeroLine
        eyebrow={`Predicted for “${data.name || '—'}”`}
        value={<><span className='text-3xl'>{age ?? '—'}</span> <span className='text-xs text-gray-400 font-normal'>years</span></>}
        sub={data.count ? `based on ${data.count.toLocaleString()} samples` : null}
        right={<Chip tone='amber'>age</Chip>}
      />
      <div className='mt-2 flex items-end gap-1 h-12'>
        {bins.map((peak) => {
          const dist = Math.abs(peak - (age || 30))
          const h = Math.max(4, 40 - dist * 1.2)
          const active = dist < 6
          return (
            <div key={peak} className='flex-1 flex flex-col items-center gap-1'>
              <div className={`w-full rounded-t ${active ? 'bg-amber-400' : 'bg-white/15'}`} style={{ height: `${h}px` }} />
              <span className='text-[9px] text-gray-500'>{peak}</span>
            </div>
          )
        })}
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
