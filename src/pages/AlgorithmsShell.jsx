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
import { motion, useReducedMotion } from 'framer-motion'
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

  // We deliberately DO NOT use <AnimatePresence mode='wait'> here.
  //
  // The combination of AnimatePresence + Suspense + lazy <Outlet /> is a
  // known framer-motion footgun: navigating from one lazy topic route to
  // another cancels the exit animation mid-flight (because Suspense
  // throws while the exit is still tweening), and the newly-mounted
  // motion.div gets stuck at `opacity: 0` — the exact "blank page until
  // hard refresh" symptom the user reported.
  //
  // Instead we render a plain keyed `motion.div` that only runs an
  // `initial → animate` transition on mount. Each new pathname yields a
  // new key, which unmounts the previous body and mounts a fresh one
  // that fades in from opacity 0 → 1. No exit animation to interrupt,
  // no Suspense race. Snappy, resilient.
  return (
    <TopicShell
      slug={slug}
      title={topic?.title || 'Algorithms'}
      category={topic?.category || ''}
      intro={topic?.summary}
      complexityChip={topic?.complexity}
    >
      <Suspense fallback={<PageBoot />}>
        {reduce ? (
          <Outlet />
        ) : (
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        )}
      </Suspense>
    </TopicShell>
  )
}
