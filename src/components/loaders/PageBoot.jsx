// PageBoot — full-screen Suspense fallback used by App.jsx while lazy
// pages are code-split-fetched. Big cosmos LuxeLoader with a rotating
// quip below it so a slow boot still feels intentional.

import { useEffect, useState } from 'react'
import LuxeLoader from './LuxeLoader'

const QUIPS = [
  'Compiling the universe…',
  'Aligning the qubits…',
  'Booting reactor…',
  'Warming the pixels…',
  'Threading the light…',
  'Sampling |ψ|²…',
  'Rendering the manifold…',
  'Untangling the graph…',
]

export default function PageBoot({ variant = 'cosmos' }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * QUIPS.length))
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % QUIPS.length), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <div className='min-h-screen w-full flex items-center justify-center bg-surface-base'>
      <div className='flex flex-col items-center gap-4'>
        <LuxeLoader variant={variant} size='lg' />
        <div className='eyebrow-mono text-fg-muted tracking-widest'>
          {QUIPS[i]}
        </div>
      </div>
    </div>
  )
}
