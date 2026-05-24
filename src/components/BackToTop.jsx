import { useState, useEffect } from 'react'

// Floating scroll-back-up control. WCAG mobile spec calls for 44×44
// tap targets; the previous 40×40 was just under the line. Hover gets
// the rose glow shadow defined in the new shadow ramp; press scales
// down 5% for tactile feedback. Hidden until the user has scrolled
// 400px (otherwise it competes with above-the-fold actions).

const BackToTop = () => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50
                 w-11 h-11 sm:w-12 sm:h-12 rounded-full
                 bg-surface-elevated border border-line-strong
                 text-fg-secondary hover:text-fg-primary
                 hover:bg-surface-overlay hover:border-amber-500/50
                 active:scale-95
                 transition-colors duration-200
                 shadow-sm
                 flex items-center justify-center
                 backdrop-blur-sm"
      aria-label="Back to top"
    >
      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
      </svg>
    </button>
  )
}

export default BackToTop
