// GithubRepoViz — github-repo.
//
// Payload: { full_name, description, stargazers_count, forks_count,
// open_issues_count, language, pushed_at, topics: [] }.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

export default function GithubRepoViz({ data }) {
  if (!data?.full_name) return null
  const stats = [
    ['★', data.stargazers_count],
    ['forks', data.forks_count],
    ['issues', data.open_issues_count],
    ['watchers', data.subscribers_count ?? data.watchers_count],
  ]
  return (
    <div>
      <HeroLine
        eyebrow='GitHub repo'
        value={<span className='font-mono'>{data.full_name}</span>}
        sub={data.description}
        right={data.language && <Chip tone='cyan'>{data.language}</Chip>}
      />
      <div className='grid grid-cols-4 gap-2 mt-2'>
        {stats.map(([label, val]) => (
          <div key={label} className='bg-white/[0.03] rounded px-2 py-2 text-center'>
            <div className='text-white font-bold text-sm'>{val != null ? val.toLocaleString() : '—'}</div>
            <div className='text-[10px] uppercase tracking-widest text-gray-500'>{label}</div>
          </div>
        ))}
      </div>
      {Array.isArray(data.topics) && data.topics.length > 0 && (
        <div className='mt-2 flex flex-wrap gap-1'>
          {data.topics.slice(0, 8).map((t) => (
            <span key={t} className='text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-200 border border-cyan-400/20'>{t}</span>
          ))}
        </div>
      )}
      <div className='text-[10px] text-gray-500 mt-2'>
        Last push {data.pushed_at ? new Date(data.pushed_at).toLocaleDateString() : '—'}
        {data.license?.spdx_id && <> · {data.license.spdx_id}</>}
      </div>
      <a href={data.html_url} target='_blank' rel='noopener noreferrer' className='mt-1 inline-block text-cyan-300 hover:text-cyan-200 text-xs'>
        Open on GitHub →
      </a>
      <CollapseRawJson data={data} />
    </div>
  )
}
