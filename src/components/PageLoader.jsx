// Shared page loader — antd Skeleton on a dark page bg, used as the
// Suspense fallback for every lazy-loaded route. Replaces the hand-
// rolled bg-gray-950 pulse blocks with antd's animated shimmer for a
// nicer "this is loading" feel.

import { Skeleton } from 'antd'

// `variant` lets pages tune what the placeholder looks like — most
// pages get the default block layout, hero/home gets a centered spin.

export default function PageLoader({ variant = 'page' }) {
  if (variant === 'home') {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-surface-base">
        <div className="w-14 h-14 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }
  // Standard page — title + paragraph + grid skeleton on a dark bg.
  return (
    <div className="min-h-screen bg-surface-base pt-28 px-6 pb-16">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header band */}
        <Skeleton.Input active size="large" style={{ width: 320, height: 44 }} />
        <Skeleton paragraph={{ rows: 2, width: ['80%', '60%'] }} active title={false} />
        {/* 3 row blocks */}
        <div className="space-y-4 mt-8">
          {[1, 2, 3].map(i => (
            <Skeleton.Node key={i} active style={{ width: '100%', height: 110, borderRadius: 12 }} />
          ))}
        </div>
        {/* Grid of cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
          {[...Array(8)].map((_, i) => (
            <Skeleton.Node key={i} active style={{ width: '100%', height: 120, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
