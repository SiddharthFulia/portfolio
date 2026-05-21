// Adapted from 21st.dev's "SparklesCore" (tsparticles wrapper) to plain
// JSX for this repo — no shadcn, no `cn` utility, no TypeScript. The
// particles engine still does all the heavy lifting; this component is
// just the React surface around it.
//
// Use inside any relative-positioned container as an absolute-fill
// layer. The engine inits once across the whole app (memoised by
// tsparticles) so dropping multiple instances on the same page is fine.
//
// Common patterns:
//   • Hero overlay  — particleDensity ~80, full-bleed, transparent bg
//   • CTA accent    — particleDensity ~250, masked behind a heading
//   • Subtle ambience — particleDensity 30, slow speed
//
// All sizes / counts scale linearly with screen real estate via the
// `density` field, so phones automatically get fewer particles.

import { useEffect, useId, useState } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import { motion, useAnimation } from 'framer-motion'

const cx = (...xs) => xs.filter(Boolean).join(' ')

export default function Sparkles({
  id,
  className,
  background = 'transparent',
  minSize = 0.6,
  maxSize = 1.4,
  speed = 4,
  particleColor = '#ffffff',
  particleDensity = 100,
}) {
  const [init, setInit] = useState(false)
  const controls = useAnimation()
  const generatedId = useId()

  useEffect(() => {
    let mounted = true
    initParticlesEngine(async (engine) => {
      await loadSlim(engine)
    }).then(() => {
      if (mounted) setInit(true)
    })
    return () => { mounted = false }
  }, [])

  const particlesLoaded = async (container) => {
    if (container) controls.start({ opacity: 1, transition: { duration: 1 } })
  }

  if (!init) return null

  return (
    <motion.div animate={controls} className={cx('opacity-0', className)}>
      <Particles
        id={id || generatedId}
        className="h-full w-full"
        particlesLoaded={particlesLoaded}
        options={{
          background: { color: { value: background } },
          fullScreen: { enable: false, zIndex: 1 },
          fpsLimit: 120,
          interactivity: {
            events: {
              onClick: { enable: true, mode: 'push' },
              onHover: { enable: false, mode: 'repulse' },
              resize: true,
            },
            modes: {
              push: { quantity: 4 },
              repulse: { distance: 200, duration: 0.4 },
            },
          },
          particles: {
            color: { value: particleColor },
            move: {
              enable: true,
              direction: 'none',
              outModes: { default: 'out' },
              random: false,
              speed: { min: 0.1, max: 1 },
              straight: false,
            },
            number: {
              density: { enable: true, width: 400, height: 400 },
              value: particleDensity,
            },
            opacity: {
              value: { min: 0.1, max: 1 },
              animation: { enable: true, speed, sync: false, startValue: 'random' },
            },
            shape: { type: 'circle' },
            size: { value: { min: minSize, max: maxSize } },
          },
          detectRetina: true,
        }}
      />
    </motion.div>
  )
}
