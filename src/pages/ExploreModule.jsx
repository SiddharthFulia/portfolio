import { lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageLoader from '../components/PageLoader'

// Slug → lazy component. `food` is the historical slug and stays as
// the canonical; `foodish` is aliased for BC because the task brief
// documents that URL.
const COMPONENTS = {
  pokedex:   lazy(() => import('../components/explore/Pokedex')),
  rickmorty: lazy(() => import('../components/explore/RickMorty')),
  launches:  lazy(() => import('../components/explore/SpaceLaunches')),
  mtg:       lazy(() => import('../components/explore/MTGCards')),
  memes:     lazy(() => import('../components/explore/MemeGenerator')),
  food:      lazy(() => import('../components/explore/FoodGallery')),
  foodish:   lazy(() => import('../components/explore/FoodGallery')),
  dogs:      lazy(() => import('../components/explore/DogExplorer')),
  countries: lazy(() => import('../components/explore/CountryExplorer')),
  quotes:    lazy(() => import('../components/explore/QuoteWall')),
}

const META = {
  pokedex:   { label: 'Pokedex',        accent: 'bg-red-500', tone: 'from-red-500/25',
    eyebrow: '386 species · Gen 1 – 3',
    info: 'Browse Pokemon across 3 generations. Click any card to see stats, types, abilities. Search by name or number.' },
  rickmorty: { label: 'Rick & Morty',    accent: 'bg-emerald-500', tone: 'from-emerald-500/25',
    eyebrow: '826 characters · live status',
    info: 'Browse all 826 characters. Search by name, filter by status (Alive/Dead/Unknown) or species. Click for full details.' },
  launches:  { label: 'Space Launches',  accent: 'bg-blue-500', tone: 'from-blue-500/25',
    eyebrow: 'Upcoming missions · live countdown',
    info: 'Upcoming rocket launches worldwide with live countdowns, rocket info, launch providers, pads, and mission details.' },
  mtg:       { label: 'Magic Cards',     accent: 'bg-amber-500', tone: 'from-amber-500/25',
    eyebrow: 'Full library · full-text search',
    info: 'Search Magic: The Gathering cards by name, oracle text, type, or keyword. Click Random for a fresh hand. Downloads and clipboard-copy included.' },
  memes:     { label: 'Meme Generator',  accent: 'bg-yellow-500', tone: 'from-yellow-500/25',
    eyebrow: '100 templates · caption + download',
    info: 'Pick any template, type top and bottom text, and download a captioned PNG. Text is rendered client-side — nothing leaves the browser.' },
  food:      { label: 'Recipe Gallery',  accent: 'bg-orange-500', tone: 'from-orange-500/25',
    eyebrow: 'Full recipes · ingredients + video',
    info: 'Search recipes by name or category. Each card opens with the full ingredient list, step-by-step instructions, and a YouTube link where available.' },
  foodish:   { label: 'Recipe Gallery',  accent: 'bg-orange-500', tone: 'from-orange-500/25',
    eyebrow: 'Full recipes · ingredients + video',
    info: 'Search recipes by name or category. Each card opens with the full ingredient list, step-by-step instructions, and a YouTube link where available.' },
  dogs:      { label: 'Dog Explorer',    accent: 'bg-amber-500', tone: 'from-amber-500/25',
    eyebrow: '120+ breeds · unlimited shuffle',
    info: 'Random dog photos from 120+ breeds. Search breeds in the dropdown, click Shuffle for new photos. Sub-breeds listed with a dot.' },
  countries: { label: 'World Countries', accent: 'bg-emerald-500', tone: 'from-emerald-500/25',
    eyebrow: '250 countries · flags + neighbours',
    info: '250 countries with flags, capitals, population, languages, currencies, and clickable neighbours. Filter by region, sort by population or area.' },
  quotes:    { label: 'Quote Wall',      accent: 'bg-cyan-500', tone: 'from-cyan-500/25',
    eyebrow: 'Fresh batches · favourites saved locally',
    info: 'Inspiring quotes in a masonry layout. Load More pulls a fresh batch and dedupes; tap the heart to save favourites to this browser.' },
}

// PageLoader is the canonical Suspense fallback site-wide; keep the
// shimmer feel consistent with the rest of the lazy routes.

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
    <div className="min-h-screen bg-gray-950 text-white text-fg-primary">
      <div className="relative max-w-6xl mx-auto px-6 pt-28 sm:pt-32 pb-6 overflow-hidden">
        {/* Ambient orbs — same treatment as the Explore hub. */}
        <div aria-hidden className="ambient-orb -top-40 -left-32 opacity-70" />
        <div aria-hidden className="ambient-orb ambient-orb-cool -top-20 right-0 opacity-50" />

        <Link to="/explore" className="relative inline-flex items-center gap-2 tap-44 -ml-2 px-2 text-gray-500 hover:text-white text-sm font-medium transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All modules
        </Link>

        <div className="relative">
          <div className="eyebrow-mono mb-3">// {meta.eyebrow || 'Public API module'}</div>
          <div className="flex items-start gap-4 mb-1 flex-wrap">
            <div className={`h-1.5 w-14 rounded-full mt-3 ${meta.accent}`} />
            <div className="flex-1 min-w-0">
              <h1 className="font-poppins font-black text-4xl md:text-5xl leading-tight">
                <span className="gradient-text-amber">{meta.label}</span>
              </h1>
            </div>
          </div>
          <p className="text-gray-400 mt-3 text-sm max-w-2xl leading-relaxed">{meta.info}</p>
        </div>

        <div className="mt-6 h-px bg-white/5" />
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <Suspense fallback={<PageLoader />}><Component /></Suspense>
      </div>
    </div>
  )
}

export default ExploreModule
