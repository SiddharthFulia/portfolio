// Dog Explorer — 120+ breeds, browse random or by breed.
//
// Data source: dog.ceo (via /api/proxy/dogbreeds and friends). The API
// exposes a nested breed → sub-breeds map. We flatten it into a single
// searchable Select and expose "Shuffle" for random photos.

import { useState, useEffect } from 'react'
import { Select, Modal, Empty } from 'antd'
import { ReloadOutlined, DownloadOutlined, HeartOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchRandomDog, fetchDogBreeds, fetchDogBreed } from '../../api/nasa'

const DogExplorer = () => {
  const [images, setImages] = useState([])
  const [breeds, setBreeds] = useState([])
  const [selectedBreed, setSelectedBreed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchDogBreeds().then(({ data }) => {
      if (data?.message) {
        const all = []
        Object.entries(data.message).forEach(([breed, subs]) => {
          const label = breed.charAt(0).toUpperCase() + breed.slice(1)
          all.push({ value: breed, label })
          subs.forEach(sub => {
            all.push({
              value: `${breed}/${sub}`,
              label: `${label} · ${sub.charAt(0).toUpperCase() + sub.slice(1)}`,
            })
          })
        })
        setBreeds(all)
      }
    })
    loadRandom()
  }, [])

  const loadRandom = async () => {
    setLoading(true)
    setError(null)
    setSelectedBreed(null)
    const { data, error: err } = await fetchRandomDog({ count: 12 })
    if (err) setError(err)
    else if (data?.message) setImages(data.message)
    setLoading(false)
  }

  const loadBreed = async (breed) => {
    if (!breed) { loadRandom(); return }
    setLoading(true)
    setError(null)
    setSelectedBreed(breed)
    const { data, error: err } = await fetchDogBreed({ breed, count: 12 })
    if (err) setError(err)
    else if (data?.message) setImages(data.message)
    setLoading(false)
  }

  const download = (url) => {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = 'dog.jpg'
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select
          showSearch
          allowClear
          size="large"
          placeholder="Search 120+ breeds..."
          value={selectedBreed}
          onChange={loadBreed}
          options={breeds}
          className="flex-1"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          notFoundContent="No breed found"
        />
        <Button variant="primary" size="large" icon={<ReloadOutlined />} onClick={() => selectedBreed ? loadBreed(selectedBreed) : loadRandom()}>
          Shuffle
        </Button>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Pick a breed to see 12 photos of that breed, or shuffle for a random mix. Sub-breeds are listed with a dot.
      </p>

      {/* Selected breed info */}
      {selectedBreed && (
        <div className="rounded-xl border border-white/5 bg-gradient-to-r from-amber-500/10 to-rose-500/5 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Currently viewing</div>
            <div className="text-white font-bold text-sm capitalize">
              {selectedBreed.replace('/', ' · ').replace(/\b\w/g, m => m.toUpperCase())}
            </div>
            <div className="text-gray-500 text-[11px] mt-0.5">
              Showing 12 photos. Click Shuffle for a fresh dozen.
            </div>
          </div>
          <button onClick={() => loadRandom()}
            className="shrink-0 text-xs text-gray-400 hover:text-white transition-colors">
            Clear ×
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{images.length} photos</span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="cosmos" size="lg" label="Fetching dogs…" />
        </div>
      ) : images.length === 0 ? (
        <Empty description={<span className="text-gray-500">No photos to show.</span>} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((url, i) => (
            <AnimatedCard key={`${url}-${i}`} tiltAmount={10} onClick={() => setSelected(url)}
              className="cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors">
              <img src={url} alt="Dog" loading="lazy" className="w-full aspect-square object-cover" />
            </AnimatedCard>
          ))}
        </div>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={640} centered destroyOnClose>
        {selected && (
          <div className="text-center">
            <img src={selected} alt="Dog" className="w-full max-h-[60vh] object-contain rounded-lg mb-4" />
            <div className="flex justify-center gap-2">
              <Button variant="primary" icon={<DownloadOutlined />} onClick={() => download(selected)}>
                Download
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default DogExplorer
