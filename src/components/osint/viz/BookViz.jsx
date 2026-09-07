// BookViz — openlibrary.
//
// Open Library returns { "ISBN:123…": { title, authors, publish_date, cover, url } }.
// We take the first key regardless of ISBN provided.

import { HeroLine, CollapseRawJson } from './_shared.jsx'

export default function BookViz({ data }) {
  const key = data && Object.keys(data)[0]
  const book = key ? data[key] : null
  if (!book) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>No book found for that ISBN.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  const cover = book.cover?.medium || book.cover?.small || book.cover?.large
  const authors = (book.authors || []).map((a) => a.name).join(', ')
  return (
    <div>
      <div className='flex gap-3'>
        {cover && (
          <img src={cover} alt='' className='w-20 h-28 sm:w-24 sm:h-32 object-cover rounded border border-white/10 shrink-0' loading='lazy' />
        )}
        <div className='flex-1 min-w-0'>
          <HeroLine
            eyebrow='Open Library'
            value={book.title}
            sub={authors || 'Unknown author'}
          />
          <div className='text-gray-400 text-xs space-y-0.5'>
            {book.publish_date && <div>Published {book.publish_date}</div>}
            {book.number_of_pages && <div>{book.number_of_pages} pages</div>}
            <div className='font-mono text-gray-500'>{key}</div>
          </div>
          {book.url && (
            <a href={book.url} target='_blank' rel='noopener noreferrer' className='mt-2 inline-block text-cyan-300 hover:text-cyan-200 text-xs'>
              View on Open Library →
            </a>
          )}
        </div>
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
