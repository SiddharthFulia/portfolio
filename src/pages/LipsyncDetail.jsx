import { Button } from 'antd'
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons'
import JobDetailPage from '../components/JobDetailPage'
import { getLipsyncStatus } from '../api/ai'

function LipsyncOutput({ job }) {
  if (!job?.outputUrl) return null
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/60">
      <video src={job.outputUrl} controls playsInline className="w-full max-h-[70vh] object-contain bg-black" />
      <div className="p-4 space-y-3">
        {job.prompt && <p className="text-gray-300 text-sm leading-relaxed">{job.prompt}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => {
            const a = document.createElement('a')
            a.href = job.outputUrl; a.download = `${job.jobId || 'lipsync'}.mp4`; a.target = '_blank'; a.click()
          }} icon={<DownloadOutlined />}>Save MP4</Button>
          <a href={job.outputUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-emerald-400 transition-colors break-all">
            <LinkOutlined /><span className="truncate max-w-[300px]">{job.outputUrl}</span>
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {job.model && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {job.model}
            </span>
          )}
          {job.durationMs && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border border-gray-700 bg-gray-800 text-gray-400">
              {(job.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LipsyncDetail() {
  return <JobDetailPage
    lane="lipsync"
    title="Lip Sync Studio"
    accentClass="text-white"
    backTo="/lipsync"
    getStatus={getLipsyncStatus}
    idKey="jobId"
    renderOutput={(job) => <LipsyncOutput job={job} />}
  />
}
