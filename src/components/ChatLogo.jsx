// Brand mark used by the AI Chat: a stylized gradient sparkle inside a
// rounded square. Reads as a clean, modern "AI core" — no cartoon robot
// faces. Inline SVG so it ships with the bundle (no extra HTTP request)
// and renders sharp at any size.

export default function ChatLogo({ size = 32, className = '', glow = false }) {
  // Unique gradient id per instance so multiple logos on the same page
  // never collide (browsers will reuse the first definition otherwise).
  const gid = `sid-chat-${Math.random().toString(36).slice(2, 8)}`
  const sid = `sid-chat-s-${Math.random().toString(36).slice(2, 8)}`
  return (
    <svg
      viewBox="0 0 40 40" width={size} height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${glow ? 'drop-shadow-[0_0_8px_rgba(124,58,237,0.55)]' : ''}`}
      aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={sid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.78" />
        </linearGradient>
      </defs>
      {/* Rounded-square shell */}
      <rect x="2" y="2" width="36" height="36" rx="11" fill={`url(#${gid})`} />
      {/* Inner sheen — light from top-left */}
      <rect x="2" y="2" width="36" height="36" rx="11"
        fill="white" opacity="0.08" />
      {/* Sparkle / 4-point star core */}
      <path
        d="M20 8 L21.6 17.4 L31 19 Q31.4 19 31 20 L21.6 21.6 L20 31 Q20 31.4 19 31 L18.4 21.6 L9 20 Q8.6 20 9 19 L18.4 17.4 Z"
        fill={`url(#${sid})`} />
      {/* Centered dot — adds depth */}
      <circle cx="20" cy="19.6" r="1.3" fill="rgba(15, 23, 42, 0.55)" />
    </svg>
  )
}
