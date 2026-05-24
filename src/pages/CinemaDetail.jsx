import { useNavigate } from 'react-router-dom'
import { CopyOutlined, SendOutlined } from '@ant-design/icons'
import { message as antMessage } from 'antd'
import JobDetailPage from '../components/JobDetailPage'
import { getCinemaStatus } from '../api/ai'

// Cinema doesn't run on a worker — it's a Groq-planned set of shot prompts
// the user manually renders in AI Video. We surface the plan + per-shot
// "Send to AI Video" buttons here so a deep-linked /cinema/:projectId is
// useful even after the project's planning completes.
function CinemaOutput({ job }) {
  const navigate = useNavigate()
  const shots = Array.isArray(job?.shotPrompts) ? job.shotPrompts : []
  if (shots.length === 0) return null
  const copy = async (t) => {
    try { await navigator.clipboard.writeText(t); antMessage.success('Copied') } catch {}
  }
  const sendToAIVideo = (t) => {
    if (!t || !t.trim()) return
    const qs = new URLSearchParams({
      prompt: t.trim(),
      provider: 'optimized',
      mode: 'balanced',
      music: '1',
    }).toString()
    navigate(`/ai-video?${qs}`)
  }
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gray-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-300">{shots.length} planned shots</h3>
        <span className="text-[10px] font-mono text-gray-500">
          {job.shotCount || shots.length} · {job.aspectRatio} · {job.resolution}
        </span>
      </div>
      {job.masterPrompt && (
        <p className="text-[11px] text-gray-400 leading-relaxed italic border-l-2 border-amber-500/40 pl-3">
          {job.masterPrompt}
        </p>
      )}
      <ol className="space-y-2">
        {shots.map((p, i) => (
          <li key={i} className="rounded-lg border border-gray-800 bg-black/40 p-3 hover:border-amber-500/40 transition-colors">
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-amber-400 font-bold">SHOT {i + 1}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => copy(p)}
                  className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                  <CopyOutlined /> Copy
                </button>
                <button onClick={() => sendToAIVideo(p)}
                  className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                  <SendOutlined /> Render
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-300 font-mono leading-relaxed">{p}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function CinemaDetail() {
  return <JobDetailPage
    lane="cinema"
    title="Cinema"
    accentClass="text-white"
    backTo="/cinema"
    getStatus={getCinemaStatus}
    idKey="projectId"
    renderOutput={(job) => <CinemaOutput job={job} />}
  />
}
