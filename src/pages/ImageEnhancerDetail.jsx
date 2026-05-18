import { Button } from 'antd'
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons'
import JobDetailPage from '../components/JobDetailPage'
import { getImageStatus } from '../api/ai'

function ImageOutput({ job }) {
  if (!job?.outputUrl) return null
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/60">
      <img src={job.outputUrl} alt={job.prompt || 'output'} className="w-full max-h-[70vh] object-contain bg-black" />
      <div className="p-4 space-y-3">
        {job.prompt && <p className="text-gray-300 text-sm leading-relaxed">{job.prompt}</p>}
        {job.sourceUrl && (
          <div className="text-[10px] text-gray-500">
            Source: <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-cyan-400 break-all">{job.sourceUrl.slice(0, 80)}…</a>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => {
            const a = document.createElement('a')
            a.href = job.outputUrl; a.download = `${job.imageId || 'enhanced'}.png`; a.target = '_blank'; a.click()
          }} icon={<DownloadOutlined />}>Save PNG</Button>
          <a href={job.outputUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-cyan-400 transition-colors break-all">
            <LinkOutlined /><span className="truncate max-w-[300px]">{job.outputUrl}</span>
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {job.engine && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.engine}
            </span>
          )}
          {job.workflow && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.workflow}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ImageEnhancerDetail() {
  return <JobDetailPage
    lane="image"
    title="Image Studio"
    accentClass="bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent"
    backTo="/image-enhancer"
    getStatus={getImageStatus}
    idKey="imageId"
    renderOutput={(job) => <ImageOutput job={job} />}
  />
}
