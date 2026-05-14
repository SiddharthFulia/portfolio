import { useRef } from 'react'

// Shared 3D-tilt hook. Returns props you spread onto any card-like element.
// CSS vars (--tx, --ty, --glx, --gly) drive perspective rotate + a
// cursor-following radial glow overlay. Inert on touch devices (no
// mousemove events fire there). Style yourself — usage:
//
//   const tilt = useTilt(8)
//   <button {...tilt}
//     style={{
//       transform: 'perspective(800px) rotateX(var(--tx,0)) rotateY(var(--ty,0))',
//       transition: 'transform 120ms ease-out',
//     }}>
//
// Add a glow overlay if you want the cursor-follow effect:
//   <span aria-hidden className="pointer-events-none absolute inset-0
//        opacity-0 group-hover:opacity-100 transition-opacity"
//        style={{ background: 'radial-gradient(220px at var(--glx,50%) var(--gly,50%),
//                              rgba(56,189,248,0.18), transparent 65%)' }} />
export function useTilt(maxTiltDeg = 8) {
  const ref = useRef(null)
  const onMouseMove = (e) => {
    const el = ref.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = (e.clientX - rect.left) / rect.width - 0.5
    const dy = (e.clientY - rect.top) / rect.height - 0.5
    el.style.setProperty('--tx', `${(-dy * maxTiltDeg).toFixed(2)}deg`)
    el.style.setProperty('--ty', `${( dx * (maxTiltDeg + 2)).toFixed(2)}deg`)
    el.style.setProperty('--glx', `${((e.clientX - rect.left) / rect.width * 100).toFixed(1)}%`)
    el.style.setProperty('--gly', `${((e.clientY - rect.top) / rect.height * 100).toFixed(1)}%`)
  }
  const onMouseLeave = () => {
    const el = ref.current; if (!el) return
    el.style.setProperty('--tx', '0deg')
    el.style.setProperty('--ty', '0deg')
  }
  return { ref, onMouseMove, onMouseLeave }
}

// Tiny preset of the style/className you usually want on a tilt card.
// Spread `tilt.style` over your own to add the perspective transform.
export const TILT_STYLE = {
  transform: 'perspective(800px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg))',
  transition: 'transform 120ms ease-out, border-color 200ms, box-shadow 200ms',
}
