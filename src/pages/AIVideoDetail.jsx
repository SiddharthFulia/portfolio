import { Button } from 'antd'
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons'
import JobDetailPage from '../components/JobDetailPage'
import { getJobStatus } from '../api/ai'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'
const resolveVideoUrl = (url) => (url?.startsWith('http') ? url : `${BE_URL}${url}`)

function VideoOutput({ job }) {
  if (!job?.videoUrl) return null
  const url = resolveVideoUrl(job.videoUrl)
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/60">
      <video src={url} controls playsInline loop className="w-full max-h-[70vh] object-contain bg-black" />
      <div className="p-4 space-y-3">
        {job.prompt && <p className="text-gray-300 text-sm leading-relaxed">{job.prompt}</p>}
        {job.caption && (
          <p className="text-gray-500 text-xs italic border-l-2 border-gray-700 pl-3 whitespace-pre-line">{job.caption}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => {
            const a = document.createElement('a')
            a.href = url; a.download = `${job.videoId || 'ai-video'}.mp4`; a.target = '_blank'; a.click()
          }} icon={<DownloadOutlined />}>Save MP4</Button>
          <a href={url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-cyan-400 transition-colors break-all">
            <LinkOutlined /><span className="truncate max-w-[300px]">{url}</span>
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {job.provider && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.provider}
            </span>
          )}
          {job.model && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.model}
            </span>
          )}
          {job.aspectRatio && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.aspectRatio}
            </span>
          )}
          {job.duration && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.duration}s
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AIVideoDetail() {
  return <JobDetailPage
    lane="video"
    title="AI Video"
    accentClass="bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-300 bg-clip-text text-transparent"
    backTo="/ai-video"
    getStatus={getJobStatus}
    idKey="videoId"
    renderOutput={(job) => <VideoOutput job={job} />}
  />
}
