import { useState, useEffect } from 'react'
import { Select, Button, Modal } from 'antd'
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import { fetchRandomDog, fetchDogBreeds, fetchDogBreed } from '../../api/nasa'

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {[...Array(12)].map((_, i) => <div key={i} className="animate-pulse bg-gray-800 rounded-xl aspect-square" />)}
  </div>
)

const DogExplorer = () => {
  const [images, setImages] = useState([])
  const [breeds, setBreeds] = useState([])
  const [selectedBreed, setSelectedBreed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchDogBreeds().then(({ data }) => {
      if (data?.message) {
        const all = []
        Object.entries(data.message).forEach(([breed, subs]) => {
          all.push({ value: breed, label: breed.charAt(0).toUpperCase() + breed.slice(1) })
          subs.forEach(sub => {
            all.push({ value: `${breed}/${sub}`, label: `${breed.charAt(0).toUpperCase() + breed.slice(1)} — ${sub}` })
          })
        })
        setBreeds(all)
      }
    })
    loadRandom()
  }, [])

  const loadRandom = async () => {
    setLoading(true)
    setSelectedBreed(null)
    const { data } = await fetchRandomDog({ count: 12 })
    if (data?.message) setImages(data.message)
    setLoading(false)
  }

  const loadBreed = async (breed) => {
    if (!breed) { loadRandom(); return }
    setLoading(true)
    setSelectedBreed(breed)
    const { data } = await fetchDogBreed({ breed, count: 12 })
    if (data?.message) setImages(data.message)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <Select
          showSearch
          allowClear
          size="large"
          placeholder="Search breeds..."
          value={selectedBreed}
          onChange={loadBreed}
          options={breeds}
          className="flex-1"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          notFoundContent="No breed found"
        />
        <Button type="primary" size="large" icon={<ReloadOutlined />} onClick={loadRandom}
          style={{ background: '#d97706' }}>
          Shuffle
        </Button>
      </div>

      {loading ? <SkeletonGrid /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((url, i) => (
            <div key={i} onClick={() => setSelected(url)}
              className="cursor-pointer rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-all group hover:scale-[1.02]">
              <img src={url} alt="Dog" loading="lazy" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={600} centered destroyOnClose>
        {selected && (
          <div className="text-center">
            <img src={selected} alt="Dog" className="w-full rounded-lg mb-4" />
            <Button type="primary" icon={<DownloadOutlined />}
              onClick={() => { const a = document.createElement('a'); a.href = selected; a.target = '_blank'; a.download = 'dog.jpg'; a.click() }}>
              Download
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default DogExplorer
