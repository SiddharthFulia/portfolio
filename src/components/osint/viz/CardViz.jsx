// CardViz — binlist.
//
// HandyAPI wraps the payload in { Status, Country, Issuer, Scheme, Type, … }.
// We render a mini credit-card rectangle with the bank + brand.

import { flagEmoji, Chip, CollapseRawJson } from './_shared.jsx'

export default function CardViz({ data }) {
  if (!data) return null
  const brand = String(data.Scheme || '').toUpperCase()
  const type  = String(data.Type || '').toUpperCase()
  const bank  = data.Issuer?.Name || 'Unknown bank'
  const country = data.Country?.A2 || data.Country?.Alpha2 || ''
  const isPrepaid = data.CardTier === 'PREPAID'
  return (
    <div>
      <div className='rounded-xl p-4 sm:p-5 bg-gradient-to-br from-slate-800 via-slate-900 to-black border border-white/10 relative overflow-hidden'>
        <div className='absolute -top-16 -right-10 w-40 h-40 rounded-full bg-amber-400/10 blur-2xl' />
        <div className='relative'>
          <div className='flex items-start justify-between gap-3 mb-6'>
            <div>
              <div className='text-[10px] uppercase tracking-widest text-gray-500 font-bold'>Bank</div>
              <div className='text-white font-bold text-sm truncate max-w-[16rem]'>{bank}</div>
            </div>
            <div className='text-right'>
              <div className='text-2xl font-bold text-white'>{brand || '—'}</div>
              <div className='text-[10px] uppercase tracking-widest text-gray-500 font-bold'>{type}</div>
            </div>
          </div>
          <div className='font-mono text-white text-lg tracking-widest mb-2'>
            {String(data.Number?.Length ? '•••• •••• •••• ' : '')}<span className='text-amber-300'>{data.BIN || '—'}</span>
          </div>
          <div className='flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-400'>
            <span>{flagEmoji(country)} {data.Country?.Name || ''}</span>
            <div className='flex gap-1'>
              {isPrepaid && <Chip tone='amber'>prepaid</Chip>}
              {data.CardTier && !isPrepaid && <Chip tone='cyan'>{data.CardTier.toLowerCase()}</Chip>}
            </div>
          </div>
        </div>
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
