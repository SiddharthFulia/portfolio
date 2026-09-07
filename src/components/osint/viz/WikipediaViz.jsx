// WikipediaViz — wikipedia REST summary.
//
// Payload: { title, description, extract, thumbnail: { source }, content_urls: { desktop: { page } } }.

import { HeroLine, CollapseRawJson } from './_shared.jsx'

export default function WikipediaViz({ data }) {
  if (!data?.title) return null
  const link = data.content_urls?.desktop?.page || data.content_urls?.mobile?.page
  return (
    <div>
      <div className='flex gap-3'>
        {data.thumbnail?.source && (
          <img
            src={data.thumbnail.source}
            alt=''
            className='w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-white/10 shrink-0'
            loading='lazy'
          />
        )}
        <div className='flex-1 min-w-0'>
          <HeroLine
            eyebrow='Wikipedia'
            value={data.title}
            sub={data.description}
          />
        </div>
      </div>
      <p className='text-gray-300 text-xs leading-relaxed line-clamp-5 mt-2'>{data.extract || '—'}</p>
      {link && (
        <a href={link} target='_blank' rel='noopener noreferrer' className='mt-2 inline-block text-cyan-300 hover:text-cyan-200 text-xs'>
          Read on Wikipedia →
        </a>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
