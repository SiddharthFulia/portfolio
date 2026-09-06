import { useEffect, useRef, useState, useMemo } from 'react'
import { fetchJobLogs } from '../api/ai'
import AgentPlan from './luxe/AgentPlan'

/**
 * JobLogsAgentPlan — polls /api/job-logs/:lane/:jobId and renders the stream
 * as an Agent-style task tree.
 *
 * Logs get bucketed into three groups:
 *   1. Setup        — initial logs (queue / pull / init / load / checkpoint)
 *   2. Generate     — main logs (steps / sampling / denoise / frame)
 *   3. Post-process — final logs (upscale / encode / upload / save)
 *
 * Each group's status is derived from:
 *   - outer job `status` (failed / completed → propagates to active group)
 *   - whether that group has any logs yet
 *   - whether later groups have already started (means this one is done)
 */

const SETUP_RE   = /\b(queue|queued|pull|pulling|init|initialis|initializ|load|loading|checkpoint|warmup|warm-up|warming|model)\b/i
const GENERATE_RE = /\b(step|sampling|sample|denoise|denoising|frame|inference|generat|diffus)\b/i
const POST_RE     = /\b(upscale|upscaling|encode|encoding|upload|uploading|save|saving|finaliz|post-?process|complete|done)\b/i

const truncate = (s, n = 80) => {
  if (!s) return ''
  const str = String(s)
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

const classifyLog = (msg = '') => {
  if (POST_RE.test(msg))     return 'post'
  if (GENERATE_RE.test(msg)) return 'generate'
  if (SETUP_RE.test(msg))    return 'setup'
  return null // unclassified — falls through to current active group
}

/**
 * Bucket logs into the three groups in order. Unclassified lines fall into
 * the "currently active" group based on the most recent classified line so
 * the tree never has orphans. Returns { setup, generate, post } each = log[].
 */
const bucketLogs = (logs) => {
  const groups = { setup: [], generate: [], post: [] }
  let lastBucket = 'setup'
  for (const entry of logs) {
    const msg = entry?.msg || ''
    const cls = classifyLog(msg)
    const bucket = cls || lastBucket
    groups[bucket].push(entry)
    if (cls) lastBucket = cls
  }
  return groups
}

/**
 * Pick a status for one group, given:
 *   - whether the group has logs
 *   - whether any later group has logs (→ this one is done)
 *   - the outer job status
 *   - is it the active group?
 */
const groupStatus = ({ hasLogs, laterHasLogs, jobStatus, isActiveGroup }) => {
  if (jobStatus === 'failed' && isActiveGroup && hasLogs) return 'failed'
  if (jobStatus === 'completed') return hasLogs || laterHasLogs ? 'completed' : 'pending'
  if (laterHasLogs) return 'completed'
  if (hasLogs) return 'in-progress'
  return 'pending'
}

export default function JobLogsAgentPlan({
  lane,
  jobId,
  status,           // outer job status: 'queued' | 'processing' | 'completed' | 'failed' | ...
  progressMessage,  // optional headline from BE
  error,            // optional outer error
  pollIntervalMs = 1500,
}) {
  const [logs, setLogs] = useState([])
  const sinceRef = useRef(0)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  // Reset on job/lane change
  useEffect(() => {
    setLogs([])
    sinceRef.current = 0
  }, [lane, jobId])

  useEffect(() => {
    mountedRef.current = true
    if (!lane || !jobId) return undefined

    const tick = async () => {
      try {
        const { data } = await fetchJobLogs(lane, jobId, sinceRef.current, 80)
        if (!mountedRef.current) return
        const incoming = Array.isArray(data?.logs) ? data.logs : []
        if (incoming.length > 0) {
          setLogs((prev) => [...prev, ...incoming])
          // Server returns nextSince; fall back to last log ts.
          const next =
            typeof data?.nextSince === 'number'
              ? data.nextSince
              : incoming[incoming.length - 1]?.ts || sinceRef.current
          sinceRef.current = next
        } else if (typeof data?.nextSince === 'number') {
          sinceRef.current = data.nextSince
        }
      } catch {
        // Silent — the BE may briefly 5xx; next tick retries.
      }
    }

    // Stop polling once we reach a terminal state — but still tick once
    // to flush any final logs the BE may have emitted.
    const terminal = status === 'completed' || status === 'failed'
    tick()
    if (!terminal) {
      timerRef.current = setInterval(tick, pollIntervalMs)
    }

    return () => {
      mountedRef.current = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [lane, jobId, status, pollIntervalMs])

  const tasks = useMemo(() => {
    const buckets = bucketLogs(logs)
    const setupCount    = buckets.setup.length
    const generateCount = buckets.generate.length
    const postCount     = buckets.post.length

    // The active group is the latest one that has logs (or "setup" if none).
    let activeGroup = 'setup'
    if (postCount > 0)     activeGroup = 'post'
    else if (generateCount > 0) activeGroup = 'generate'
    else if (setupCount > 0)    activeGroup = 'setup'

    // buildSubtasks — every log line except the LAST in the bucket is
    // marked completed (gets the line-through styling). The last line
    // stays 'in-progress' until either a new line arrives in the same
    // bucket (which then becomes the new "last" and pushes this one
    // into completed) OR the whole group / job has moved on. This is
    // exactly the "cross the log only when you get the next log" rule
    // the user asked for — the currently-streaming line never has a
    // strikethrough; only superseded lines do.
    const buildSubtasks = (entries, { groupComplete }) =>
      entries.map((entry, idx) => {
        const isLastInBucket = idx === entries.length - 1
        const stillStreaming = isLastInBucket && !groupComplete
        return {
          id: `${entry?.ts || 'log'}-${idx}`,
          title: truncate(entry?.msg || '', 80),
          description: entry?.msg || '',
          status: stillStreaming ? 'in-progress' : 'completed',
        }
      })

    const setupStatus = groupStatus({
      hasLogs: setupCount > 0,
      laterHasLogs: generateCount > 0 || postCount > 0,
      jobStatus: status,
      isActiveGroup: activeGroup === 'setup',
    })
    const generateStatus = groupStatus({
      hasLogs: generateCount > 0,
      laterHasLogs: postCount > 0,
      jobStatus: status,
      isActiveGroup: activeGroup === 'generate',
    })
    const postStatus = groupStatus({
      hasLogs: postCount > 0,
      laterHasLogs: false,
      jobStatus: status,
      isActiveGroup: activeGroup === 'post',
    })

    // A group is "complete" (in the sense that no further lines are
    // expected in it) either when the outer job finished OR when a
    // later group has already started — at which point even the last
    // line in this group is now a fact-of-the-past.
    const jobTerminal = status === 'completed' || status === 'failed'
    return [
      {
        id: 'setup',
        title: 'Setup',
        description: 'Queue, model load, checkpoint init',
        status: setupStatus,
        subtasks: buildSubtasks(buckets.setup, {
          groupComplete: jobTerminal || generateCount > 0 || postCount > 0,
        }),
      },
      {
        id: 'generate',
        title: 'Generate',
        description: 'Sampling, denoising, frames',
        status: generateStatus,
        subtasks: buildSubtasks(buckets.generate, {
          groupComplete: jobTerminal || postCount > 0,
        }),
      },
      {
        id: 'post',
        title: 'Post-process',
        description: 'Upscale, encode, upload',
        status: postStatus,
        subtasks: buildSubtasks(buckets.post, {
          groupComplete: jobTerminal,
        }),
      },
    ]
  }, [logs, status])

  // Expand ALL three groups by default. The earlier "only-active-group"
  // behaviour was broken on refresh — `defaultExpanded` is read by
  // AgentPlan ONCE at first mount (before logs have loaded) and never
  // re-syncs when later groups get logs. So after a refresh on a
  // completed job, the user would see Setup expanded but Generate +
  // Post-process collapsed even though those buckets had plenty of
  // lines. The outer Cinema accordion already gates whether to render
  // this tree at all, so having all three inner groups visible by
  // default is the right tradeoff — user can collapse manually if they
  // want a denser view.
  const defaultExpanded = useMemo(() => ['setup', 'generate', 'post'], [])

  // Surface an explicit "waiting" banner when expanded but no logs
  // have arrived yet. Without this the agent tree just shows three
  // empty group titles and the user thinks the polling is broken.
  const noLogsYet = logs.length === 0 && !error
  const waitingLabel = status === 'queued'
    ? '⏳ Queued — waiting for worker to pick this up…'
    : status === 'processing'
    ? '🟢 Worker active — first log line incoming…'
    : status === 'completed'
    ? '✓ Completed (no logs were captured for this job)'
    : status === 'failed'
    ? '✗ Failed'
    : 'Listening for events…'

  return (
    <div className="rounded-xl border border-line bg-surface-elevated overflow-hidden">
      {(progressMessage || error || noLogsYet) && (
        <div className="px-4 py-2 border-b border-gray-800/80 bg-cyan-500/5">
          {progressMessage && (
            <p className="text-xs text-gray-300">{progressMessage}</p>
          )}
          {error && (
            <p className="text-xs text-rose-400 mt-1">{error}</p>
          )}
          {noLogsYet && !progressMessage && !error && (
            <p className="text-xs text-cyan-200 font-mono">{waitingLabel}</p>
          )}
        </div>
      )}
      <AgentPlan
        tasks={tasks}
        defaultExpandedIds={defaultExpanded}
      />
    </div>
  )
}
