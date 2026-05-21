// Mouse-following spotlight from 21st.dev / ibelick. Adapted to JSX.
// Drop inside any container (the component sets parent position +
// overflow on mount). A soft circular glow follows the cursor and
// fades on leave. Phone users see nothing (no hover).
//
// Usage:
//   <div className="relative">
//     <Spotlight className="from-white via-white/40 to-transparent" size={240} />
//     ... content ...
//   </div>

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

const cx = (...xs) => xs.filter(Boolean).join(' ')

export default function Spotlight({ className, size = 200, springOptions = { bounce: 0 } }) {
  const containerRef = useRef(null)
  const [isHovered, setIsHovered] = useState(false)
  const [parentEl, setParentEl] = useState(null)

  const mouseX = useSpring(0, springOptions)
  const mouseY = useSpring(0, springOptions)
  const left = useTransform(mouseX, (x) => `${x - size / 2}px`)
  const top  = useTransform(mouseY, (y) => `${y - size / 2}px`)

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current.parentElement
    if (parent) {
      parent.style.position = 'relative'
      parent.style.overflow = 'hidden'
      setParentEl(parent)
    }
  }, [])

  const onMove = useCallback((e) => {
    if (!parentEl) return
    const { left, top } = parentEl.getBoundingClientRect()
    mouseX.set(e.clientX - left)
    mouseY.set(e.clientY - top)
  }, [mouseX, mouseY, parentEl])

  useEffect(() => {
    if (!parentEl) return
    const enter = () => setIsHovered(true)
    const leave = () => setIsHovered(false)
    parentEl.addEventListener('mousemove', onMove)
    parentEl.addEventListener('mouseenter', enter)
    parentEl.addEventListener('mouseleave', leave)
    return () => {
      parentEl.removeEventListener('mousemove', onMove)
      parentEl.removeEventListener('mouseenter', enter)
      parentEl.removeEventListener('mouseleave', leave)
    }
  }, [parentEl, onMove])

  return (
    <motion.div
      ref={containerRef}
      className={cx(
        'pointer-events-none absolute rounded-full blur-xl transition-opacity duration-200',
        'bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops),transparent_80%)]',
        'from-white/80 via-white/30 to-transparent',
        isHovered ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{ width: size, height: size, left, top }} />
  )
}
