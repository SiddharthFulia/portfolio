import { lazy, Suspense, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

const COMPONENTS = {
  pokedex:   lazy(() => import('../components/explore/Pokedex')),
  rickmorty: lazy(() => import('../components/explore/RickMorty')),
  launches:  lazy(() => import('../components/explore/SpaceLaunches')),
  mtg:       lazy(() => import('../components/explore/MTGCards')),
  memes:     lazy(() => import('../components/explore/MemeGenerator')),
  food:      lazy(() => import('../components/explore/FoodGallery')),
  dogs:      lazy(() => import('../components/explore/DogExplorer')),
  countries: lazy(() => import('../components/explore/CountryExplorer')),
  quotes:    lazy(() => import('../components/explore/QuoteWall')),
}

const META = {
  pokedex:   { label: 'Pokedex',        color: 'from-red-500 to-orange-500',
    info: 'Browse Pokemon across 3 generations. Click any card to see stats, types, abilities. Search by name or number.' },
  rickmorty: { label: 'Rick & Morty',    color: 'from-green-500 to-cyan-500',
    info: 'Browse all 826 characters. Search by name, filter by status (Alive/Dead/Unknown). Click for full details.' },
  launches:  { label: 'Space Launches',  color: 'from-blue-500 to-indigo-500',
    info: 'Upcoming rocket launches worldwide with live countdowns, rocket info, launch providers, pads, and mission details.' },
  mtg:       { label: 'Magic Cards',     color: 'from-purple-500 to-indigo-500',
    info: 'Browse Magic: The Gathering cards. Search by name or click Random for surprise cards. Download card images.' },
  memes:     { label: 'Meme Templates',  color: 'from-yellow-500 to-orange-500',
    info: 'Browse popular meme templates. Search by name, click to see full size, download the template image.' },
  food:      { label: 'Food Gallery',    color: 'from-orange-400 to-red-500',
    info: 'Random food photos. Pick a category (pizza, burger, pasta, biryani, dessert) or shuffle for random. Download images.' },
  dogs:      { label: 'Dog Explorer',    color: 'from-amber-400 to-amber-600',
    info: 'Random dog photos from 120+ breeds. Search breeds in the dropdown, click Shuffle for new photos. Download images.' },
  countries: { label: 'World Countries', color: 'from-emerald-500 to-green-500',
    info: '250 countries with flags, capitals, population, languages, currencies. Filter by region, sort by name/population/area.' },
  quotes:    { label: 'Quote Wall',      color: 'from-indigo-500 to-purple-500',
    info: 'Random inspiring quotes in a masonry layout. Click Load More to add more quotes.' },
}

const P = 'animate-pulse bg-gray-800 rounded'
const GridSkeleton = () => (
  <div className="space-y-4">
    <div className={`${P} h-12 w-full`} style={{borderRadius:12}} />
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {[...Array(12)].map((_, i) => <div key={i} className={`${P}`} style={{borderRadius:12, height: 140 + (i % 3) * 30}} />)}
    </div>
  </div>
)

const ModuleInfo = ({ text }) => {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <>
      <button onClick={() => setOpen(o => !o)}
        className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold transition-colors ${
          open ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-amber-400'
        }`}>i</button>
      {open && <div className="mt-3 p-4 bg-gray-800/60 border border-gray-700 rounded-xl text-sm text-gray-300 leading-relaxed">{text}</div>}
    </>
  )
}

const ExploreModule = () => {
  const { module } = useParams()
  const Component = COMPONENTS[module]
  const meta = META[module]

  if (!Component || !meta) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Module not found — <Link to="/explore" className="text-amber-400 hover:underline">back to Explore</Link></p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-6">
        <Link to="/explore" className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm font-medium transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All Modules
        </Link>
        <div className="flex items-center gap-3 mb-1">
          <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${meta.color}`} />
          <h1 className="font-poppins font-black text-3xl md:text-4xl bg-gradient-to-r from-red-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
            {meta.label}
          </h1>
          <ModuleInfo text={meta.info} />
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-amber-900/40 via-red-900/20 to-transparent" />
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <Suspense fallback={<GridSkeleton />}><Component /></Suspense>
      </div>
    </div>
  )
}

export default ExploreModule
