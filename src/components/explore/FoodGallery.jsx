import { useState, useEffect } from 'react'
import { Button, Modal, Segmented } from 'antd'
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import { fetchFoodish } from '../../api/nasa'

const CATEGORIES = ['random', 'pizza', 'burger', 'pasta', 'biryani', 'rice', 'dessert', 'dosa', 'idly', 'samosa']

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {[...Array(8)].map((_, i) => <div key={i} className="animate-pulse bg-gray-800 rounded-xl aspect-square" />)}
  </div>
)

const FoodGallery = () => {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('random')
  const [selected, setSelected] = useState(null)

  const loadImages = async (cat) => {
    setLoading(true)
    const results = []
    const params = cat === 'random' ? {} : { category: cat }
    // Fetch 8 images in parallel
    const promises = Array.from({ length: 8 }, () => fetchFoodish(params))
    const responses = await Promise.all(promises)
    responses.forEach(({ data }) => {
      if (data?.image) results.push(data.image)
    })
    setImages(results)
    setLoading(false)
  }

  useEffect(() => { loadImages(category) }, [])

  const handleCategory = (cat) => {
    setCategory(cat)
    loadImages(cat)
  }

  const download = (url) => {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = 'food.jpg'
    a.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 overflow-x-auto">
          <Segmented
            options={CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            value={category}
            onChange={handleCategory}
            size="large"
          />
        </div>
        <Button type="primary" size="large" icon={<ReloadOutlined />} onClick={() => loadImages(category)}
          style={{ background: '#ea580c' }}>
          Shuffle
        </Button>
      </div>

      {loading ? <SkeletonGrid /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((url, i) => (
            <div key={i} onClick={() => setSelected(url)}
              className="cursor-pointer rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-all group hover:scale-[1.02]">
              <img src={url} alt="Food" loading="lazy"
                className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={600} centered destroyOnClose>
        {selected && (
          <div className="text-center">
            <img src={selected} alt="Food" className="w-full rounded-lg mb-4" />
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => download(selected)}>
              Download Image
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default FoodGallery
