// Scroll-driven 3D reveal — content rotates from a tilted "perspective"
// pose down to flat as the user scrolls past it. Adapted from
// 21st.dev / aceternity to JSX.
//
// Usage:
//   <ContainerScroll titleComponent={<h2>My title</h2>}>
//     <img src="..." className="w-full h-full object-cover rounded-2xl" />
//   </ContainerScroll>

import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

export default function ContainerScroll({ titleComponent, children }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth <= 768)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const rotate    = useTransform(scrollYProgress, [0, 1], [20, 0])
  const scale     = useTransform(scrollYProgress, [0, 1], isMobile ? [0.7, 0.9] : [1.05, 1])
  const translate = useTransform(scrollYProgress, [0, 1], [0, -100])

  return (
    <div ref={ref} className="h-[60rem] md:h-[80rem] flex items-center justify-center relative p-2 md:p-20">
      <div className="py-10 md:py-40 w-full relative" style={{ perspective: '1000px' }}>
        <motion.div style={{ translateY: translate }} className="max-w-5xl mx-auto text-center">
          {titleComponent}
        </motion.div>
        <motion.div
          style={{
            rotateX: rotate, scale,
            boxShadow:
              '0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003',
          }}
          className="max-w-5xl -mt-12 mx-auto h-[30rem] md:h-[40rem] w-full border-4 border-[#6C6C6C] p-2 md:p-6 bg-[#222222] rounded-[30px] shadow-2xl">
          <div className="h-full w-full overflow-hidden rounded-2xl bg-zinc-900 md:rounded-2xl md:p-4">
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
