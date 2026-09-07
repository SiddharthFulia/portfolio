// ImageViz — picsum.
//
// picsum /v2/list returns an array of { id, author, width, height, url, download_url }.
// We show a small grid preview of the first 6 images.

import { HeroLine, CollapseRawJson } from './_shared.jsx'

export default function ImageViz({ data }) {
  const list = Array.isArray(data) ? data : []
  if (list.length === 0) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>No images returned.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  return (
    <div>
      <HeroLine
        eyebrow='Lorem Picsum'
        value={`${list.length} images`}
        sub='Public-domain placeholder gallery'
      />
      <div className='grid grid-cols-3 gap-1.5'>
        {list.slice(0, 6).map((img) => (
          <div key={img.id} className='relative rounded overflow-hidden border border-white/5 group'>
            <img
              src={`https://picsum.photos/id/${img.id}/200/140`}
              alt={img.author || ''}
              className='w-full h-20 object-cover'
              loading='lazy'
            />
            <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 text-[9px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity'>
              {img.author}
            </div>
          </div>
        ))}
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
