import { Button } from 'antd'
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons'
import JobDetailPage from '../components/JobDetailPage'
import { getAudioStatus } from '../api/ai'

function AudioOutput({ job }) {
  if (!job?.outputUrl) return null
  const kindIcon = job.kind === 'music' ? '🎵' : job.kind === 'sfx' ? '🔊' : job.kind === 'tts' ? '🗣' : '🎧'
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{kindIcon}</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">{job.model}</span>
        {job.duration && <span className="text-[10px] text-gray-600 ml-auto">{job.duration}s</span>}
      </div>
      <audio src={job.outputUrl} controls className="w-full" />
      {job.prompt && <p className="text-gray-300 text-sm leading-relaxed">{job.prompt}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={() => {
          const a = document.createElement('a')
          a.href = job.outputUrl
          a.download = `${job.jobId || 'audio'}.${job.kind === 'music' ? 'mp3' : 'wav'}`
          a.target = '_blank'; a.click()
        }} icon={<DownloadOutlined />}>Download</Button>
        <a href={job.outputUrl} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-fuchsia-400 transition-colors break-all">
          <LinkOutlined /><span className="truncate max-w-[300px]">{job.outputUrl}</span>
        </a>
      </div>
    </div>
  )
}

export default function AudioDetail() {
  return <JobDetailPage
    lane="audio"
    title="Audio Studio"
    accentClass="bg-gradient-to-r from-fuchsia-300 via-amber-300 to-emerald-300 bg-clip-text text-transparent"
    backTo="/audio"
    getStatus={getAudioStatus}
    idKey="jobId"
    renderOutput={(job) => <AudioOutput job={job} />}
  />
}
