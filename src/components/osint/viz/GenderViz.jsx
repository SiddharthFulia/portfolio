// GenderViz — genderize.
//
// Big pink or blue label with a probability bar and the sample count. Blank
// gender (unknown name) collapses to a soft "?" so we never render a bar to 0.

import { HeroLine, Chip, Bar, CollapseRawJson } from './_shared.jsx'

export default function GenderViz({ data }) {
  if (!data) return null
  const g = (data.gender || '').toLowerCase()
  const pct = Math.round((data.probability || 0) * 100)
  const tone = g === 'male' ? 'cyan' : g === 'female' ? 'fuchsia' : 'gray'
  return (
    <div>
      <HeroLine
        eyebrow={`Predicted for “${data.name || '—'}”`}
        value={<span className='capitalize'>{g || 'unknown'}</span>}
        sub={data.count ? `based on ${data.count.toLocaleString()} samples` : null}
        right={<Chip tone={tone}>{pct}%</Chip>}
      />
      <Bar pct={pct} tone={tone === 'gray' ? 'amber' : tone} />
      <div className='text-[10px] text-gray-500 mt-1'>Probability the name matches this gender in Genderize's dataset.</div>
      <CollapseRawJson data={data} />
    </div>
  )
}
