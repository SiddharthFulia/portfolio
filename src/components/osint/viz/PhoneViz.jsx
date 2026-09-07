// PhoneViz — phone.
//
// Backend normalises libphonenumber's output into flat fields so we can just
// render them directly. Renders three format lines + validity + type chip.

import { flagEmoji, HeroLine, KV, KVGrid, Chip, CollapseRawJson } from './_shared.jsx'

export default function PhoneViz({ data }) {
  if (!data) return null
  return (
    <div>
      <HeroLine
        eyebrow='Phone number'
        value={<span className='font-mono'>{data.formatE164 || data.input || '—'}</span>}
        sub={data.country ? `${flagEmoji(data.country)} +${data.countryCallingCode}` : null}
        right={
          data.valid
            ? <Chip tone='emerald'>valid</Chip>
            : data.possible
              ? <Chip tone='amber'>possible</Chip>
              : <Chip tone='rose'>invalid</Chip>
        }
      />
      <KVGrid>
        <KV label='International' value={data.formatIntl} mono />
        <KV label='National'      value={data.formatNational} mono />
        <KV label='URI'           value={data.uri} mono />
        <KV label='Type'          value={data.type} />
        <KV label='Country code'  value={data.countryCallingCode ? `+${data.countryCallingCode}` : null} />
        <KV label='National #'    value={data.nationalNumber} mono />
      </KVGrid>
      {data._fallback && (
        <div className='mt-2 text-[10px] text-amber-300/80'>{data._fallback}</div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
