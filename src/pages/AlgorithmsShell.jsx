// Layout route for `/algorithms/:slug`.
//
// Before: every topic route (30 of them) mounted its own TopicShell,
// which meant clicking a sidebar link unmounted + remounted the whole
// shell — sidebar, hero, chip bar, everything — so the user saw a
// visible flash / full-page-reload feel on every nav.
//
// After: one layout route wraps <TopicShell> around <Outlet />. The
// sidebar stays mounted across nav; only the body swaps. Content is
// cross-faded via framer-motion, keyed on the URL path, and respects
// `prefers-reduced-motion`.
//
// Each topic page under /pages/algorithms/*.jsx now returns only the
// body content — it no longer wraps its output in <TopicShell>.

import { Suspense } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import TopicShell from '../components/algorithms/TopicShell'
import { TOPICS_BY_SLUG } from '../components/algorithms/topics'
import { PageBoot } from '../components/loaders'

export default function AlgorithmsShell() {
  // Layout route sits at `/algorithms` (no :slug segment of its own), so
  // useParams() would return {} here. Match the URL directly to extract
  // the active slug — that keeps this component agnostic to how the
  // child routes are registered in App.jsx.
  const match = useMatch('/algorithms/:slug')
  const slug = match?.params?.slug
  const location = useLocation()
  const reduce = useReducedMotion()

  const topic = slug ? TOPICS_BY_SLUG[slug] : null

  return (
    <TopicShell
      slug={slug}
      title={topic?.title || 'Algorithms'}
      category={topic?.category || ''}
      intro={topic?.summary}
      complexityChip={topic?.complexity}
    >
      {reduce ? (
        <Suspense fallback={<PageBoot />}>
          <Outlet />
        </Suspense>
      ) : (
        <AnimatePresence mode='wait'>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Suspense fallback={<PageBoot />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      )}
    </TopicShell>
  )
}
