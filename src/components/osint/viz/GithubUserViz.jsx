// GithubUserViz — github-user.
//
// GitHub public user JSON: { login, name, avatar_url, bio, public_repos,
// followers, following, blog, location, company, created_at }.

import { HeroLine, KV, KVGrid, Chip, CollapseRawJson } from './_shared.jsx'

export default function GithubUserViz({ data }) {
  if (!data?.login) return null
  return (
    <div>
      <div className='flex gap-3'>
        {data.avatar_url && (
          <img src={data.avatar_url} alt='' className='w-16 h-16 rounded-full border border-white/10 shrink-0' loading='lazy' />
        )}
        <div className='flex-1 min-w-0'>
          <HeroLine
            eyebrow='GitHub'
            value={<><span className='font-mono'>@{data.login}</span>{data.name ? ` · ${data.name}` : ''}</>}
            sub={data.bio}
            right={data.hireable && <Chip tone='emerald'>hireable</Chip>}
          />
        </div>
      </div>
      <div className='grid grid-cols-3 gap-2 mt-2'>
        {[
          ['Repos',     data.public_repos],
          ['Followers', data.followers],
          ['Following', data.following],
        ].map(([label, val]) => (
          <div key={label} className='bg-white/[0.03] rounded px-2 py-2 text-center'>
            <div className='text-white font-bold text-lg'>{val ?? 0}</div>
            <div className='text-[10px] uppercase tracking-widest text-gray-500'>{label}</div>
          </div>
        ))}
      </div>
      <div className='mt-2'>
        <KVGrid>
          <KV label='Company'  value={data.company} />
          <KV label='Location' value={data.location} />
          <KV label='Joined'   value={data.created_at ? new Date(data.created_at).toLocaleDateString() : null} />
          <KV label='Blog'     value={data.blog} />
        </KVGrid>
      </div>
      <a
        href={data.html_url || `https://github.com/${data.login}`}
        target='_blank' rel='noopener noreferrer'
        className='mt-2 inline-block text-cyan-300 hover:text-cyan-200 text-xs'
      >
        View profile →
      </a>
      <CollapseRawJson data={data} />
    </div>
  )
}
