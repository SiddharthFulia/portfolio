// UserViz — randomuser.
//
// randomuser.me returns { results: [{ name: { first, last }, email, picture: { large },
// location: { city, country }, phone, nat }] }.

import { flagEmoji, HeroLine, KV, KVGrid, CollapseRawJson } from './_shared.jsx'

export default function UserViz({ data }) {
  const u = data?.results?.[0]
  if (!u) return null
  const fullName = `${u.name?.first || ''} ${u.name?.last || ''}`.trim()
  return (
    <div>
      <div className='flex gap-3'>
        {u.picture?.large && (
          <img src={u.picture.large} alt='' className='w-16 h-16 rounded-full border border-white/10 shrink-0' loading='lazy' />
        )}
        <div className='flex-1 min-w-0'>
          <HeroLine
            eyebrow='Random user'
            value={fullName}
            sub={u.email}
          />
        </div>
      </div>
      <KVGrid>
        <KV label='Location' value={`${u.location?.city || ''}, ${u.location?.country || ''}`} />
        <KV label='Phone'    value={u.phone} mono />
        <KV label='Nation'   value={u.nat ? `${flagEmoji(u.nat)} ${u.nat}` : null} />
        <KV label='DOB'      value={u.dob?.date ? new Date(u.dob.date).toLocaleDateString() : null} />
      </KVGrid>
      <div className='text-[10px] text-gray-500 mt-2'>Synthetic data — no real person.</div>
      <CollapseRawJson data={data} />
    </div>
  )
}
