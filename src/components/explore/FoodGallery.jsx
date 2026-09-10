// Food Gallery — recipe browser.
//
// Fix history: the old backend proxy pointed at foodish-api.com which
// went 503 upstream in Sep 2026 and never recovered. We now consume
// TheMealDB (also free, CORS-enabled, no key) which ships real recipes
// with thumbnails, ingredients, category, cuisine, and video guides —
// a much richer surface than random food photos.
//
// Endpoints:
//   GET  /categories.php                        → 14 categories
//   GET  /filter.php?c=<cat>                    → meals in a category
//   GET  /random.php                            → single random recipe
//   GET  /lookup.php?i=<id>                     → full recipe
//   GET  /search.php?s=<q>                      → search by name
// All served fresh, no cache — safe to hammer.

import { useState, useEffect, useCallback } from 'react'
import { Input, Modal, Tag, Empty } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'

const API = 'https://www.themealdb.com/api/json/v1/1'

// Categories are stable — hard-code the featured 8 rather than round-trip.
const CATEGORIES = [
  { id: 'Beef',      icon: '🥩' },
  { id: 'Chicken',   icon: '🍗' },
  { id: 'Dessert',   icon: '🍰' },
  { id: 'Pasta',     icon: '🍝' },
  { id: 'Seafood',   icon: '🦞' },
  { id: 'Vegetarian',icon: '🥗' },
  { id: 'Breakfast', icon: '🍳' },
  { id: 'Pork',      icon: '🥓' },
]

const FoodGallery = () => {
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState('Chicken')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadCategory = useCallback(async (cat) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/filter.php?c=${encodeURIComponent(cat)}`)
      const data = await res.json()
      setMeals(Array.isArray(data?.meals) ? data.meals : [])
    } catch (e) {
      setError('Recipe service is temporarily unavailable')
      setMeals([])
    }
    setLoading(false)
  }, [])

  const searchMeals = useCallback(async (q) => {
    if (!q.trim()) { loadCategory(category); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/search.php?s=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setMeals(Array.isArray(data?.meals) ? data.meals : [])
    } catch {
      setError('Recipe service is temporarily unavailable')
      setMeals([])
    }
    setLoading(false)
  }, [category, loadCategory])

  const loadRandom = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSearch('')
    try {
      // Pull 8 random cards in parallel; TheMealDB has ~300 recipes total,
      // so eight fetches will rarely all collide.
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => fetch(`${API}/random.php`).then(r => r.json()).catch(() => null))
      )
      const seen = new Set()
      const list = []
      for (const r of responses) {
        const m = r?.meals?.[0]
        if (m && !seen.has(m.idMeal)) { seen.add(m.idMeal); list.push(m) }
      }
      setMeals(list)
    } catch {
      setError('Recipe service is temporarily unavailable')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadCategory(category) }, [category, loadCategory])

  const openDetail = async (id) => {
    setSelectedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`${API}/lookup.php?i=${id}`)
      const data = await res.json()
      setDetail(data?.meals?.[0] || null)
    } catch {
      setDetail(null)
    }
    setDetailLoading(false)
  }

  const ingredients = (m) => {
    if (!m) return []
    const out = []
    for (let i = 1; i <= 20; i++) {
      const ing = m[`strIngredient${i}`]?.trim()
      const measure = m[`strMeasure${i}`]?.trim()
      if (ing) out.push({ ing, measure })
    }
    return out
  }

  const downloadImage = async (url, name) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${name || 'recipe'}.jpg`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      {/* Search + shuffle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input.Search
          placeholder="Search recipes by name..."
          allowClear size="large"
          enterButton={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={searchMeals}
          className="flex-1"
        />
        <Button variant="secondary" size="large" icon={<ReloadOutlined />} onClick={loadRandom}>
          Random meal
        </Button>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Search across every recipe in the database, or shuffle for 8 random dishes.
      </p>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => { setCategory(c.id); setSearch('') }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              category === c.id && !search
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-white/[0.02] border-white/10 text-gray-400 hover:border-white/25 hover:text-white'
            }`}
          >
            <span className="mr-1">{c.icon}</span>{c.id}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{meals.length} recipes</span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="cosmos" size="lg" label="Plating up recipes…" />
        </div>
      ) : meals.length === 0 ? (
        <Empty description={<span className="text-gray-500">No recipes match that filter.</span>} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {meals.map(m => (
            <AnimatedCard
              key={m.idMeal}
              tiltAmount={10}
              onClick={() => openDetail(m.idMeal)}
              effect="fire"
              className="cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors"
            >
              <img src={m.strMealThumb} alt={m.strMeal} loading="lazy"
                className="w-full aspect-square object-cover" />
              <div className="p-2.5">
                <p className="text-white text-[11px] font-semibold line-clamp-2 leading-tight">{m.strMeal}</p>
              </div>
            </AnimatedCard>
          ))}
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selectedId}
        onCancel={() => { setSelectedId(null); setDetail(null) }}
        footer={null}
        width={640}
        centered
        destroyOnClose
      >
        {detailLoading || !detail ? (
          <div className="py-20 flex justify-center">
            <LuxeLoader variant="cosmos" size="md" label="Loading recipe…" />
          </div>
        ) : (
          <div>
            <img src={detail.strMealThumb} alt={detail.strMeal} className="w-full h-56 object-cover rounded-lg mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">{detail.strMeal}</h2>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {detail.strCategory && <Tag color="orange">{detail.strCategory}</Tag>}
              {detail.strArea && <Tag color="cyan">{detail.strArea}</Tag>}
              {detail.strTags?.split(',').filter(Boolean).slice(0, 4).map(t => (
                <Tag key={t}>{t.trim()}</Tag>
              ))}
            </div>

            <h4 className="text-xs font-semibold text-gray-400 mb-2">INGREDIENTS</h4>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-4">
              {ingredients(detail).map(({ ing, measure }, i) => (
                <div key={i} className="flex items-baseline justify-between text-xs border-b border-white/5 py-1">
                  <span className="text-white">{ing}</span>
                  <span className="text-gray-500 text-[11px] shrink-0 ml-2">{measure}</span>
                </div>
              ))}
            </div>

            <h4 className="text-xs font-semibold text-gray-400 mb-2">INSTRUCTIONS</h4>
            <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line mb-4">{detail.strInstructions}</p>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<DownloadOutlined />} onClick={() => downloadImage(detail.strMealThumb, detail.strMeal)}>
                Download photo
              </Button>
              {detail.strYoutube && (
                <Button variant="secondary" icon={<PlayCircleOutlined />} href={detail.strYoutube} target="_blank" rel="noreferrer noopener">
                  Watch on YouTube
                </Button>
              )}
              {detail.strSource && (
                <Button variant="ghost" href={detail.strSource} target="_blank" rel="noreferrer noopener">
                  Original recipe
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default FoodGallery
