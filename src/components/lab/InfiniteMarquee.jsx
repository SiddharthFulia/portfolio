import { useState } from 'react'

const techStack = [
  { name: 'React', color: '#61DAFB' },
  { name: 'Next.js', color: '#FFFFFF' },
  { name: 'Node.js', color: '#68A063' },
  { name: 'Python', color: '#3776AB' },
  { name: 'TypeScript', color: '#3178C6' },
  { name: 'MongoDB', color: '#47A248' },
  { name: 'PostgreSQL', color: '#4169E1' },
  { name: 'Redis', color: '#DC382D' },
  { name: 'Docker', color: '#2496ED' },
  { name: 'TailwindCSS', color: '#06B6D4' },
  { name: 'Express.js', color: '#FFFFFF' },
  { name: 'Three.js', color: '#FFFFFF' },
  { name: 'LangChain', color: '#1C3C3C' },
  { name: 'OpenAI', color: '#10A37F' },
]

const row1 = techStack.slice(0, 7)
const row2 = techStack.slice(7)

const keyframes = `
@keyframes marquee-left {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes marquee-right {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}
@keyframes shimmer {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes glow-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
`

const TechCard = ({ name, color, onHover, onLeave }) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => { setHovered(true); onHover() }}
      onMouseLeave={() => { setHovered(false); onLeave() }}
      style={{
        position: 'relative',
        flexShrink: 0,
        padding: '2px',
        borderRadius: '9999px',
        background: `linear-gradient(135deg, ${color}, #6366f1, ${color}, #a855f7)`,
        backgroundSize: '300% 300%',
        animation: 'shimmer 3s ease infinite',
        transform: hovered ? 'scale(1.15)' : 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        cursor: 'pointer',
        zIndex: hovered ? 10 : 1,
      }}
    >
      {/* Glow effect */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            inset: '-8px',
            borderRadius: '9999px',
            background: `radial-gradient(circle, ${color}40, transparent 70%)`,
            animation: 'glow-pulse 1.5s ease infinite',
            pointerEvents: 'none',
            filter: 'blur(8px)',
          }}
        />
      )}

      {/* Inner card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 24px',
          borderRadius: '9999px',
          background: 'rgba(15, 15, 25, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          whiteSpace: 'nowrap',
          boxShadow: hovered
            ? `0 0 24px ${color}33, 0 0 48px ${color}1a, inset 0 1px 0 rgba(255,255,255,0.1)`
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        {/* Colored dot indicator */}
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: color,
            boxShadow: hovered ? `0 0 8px ${color}` : 'none',
            transition: 'box-shadow 0.3s ease',
          }}
        />

        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: hovered ? color : 'rgba(255, 255, 255, 0.85)',
            transition: 'color 0.3s ease',
            fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          {name}
        </span>
      </div>
    </div>
  )
}

const MarqueeRow = ({ items, direction = 'left', speed = 35 }) => {
  const [paused, setPaused] = useState(false)
  // Duplicate enough times to guarantee seamless loop
  const repeated = [...items, ...items, ...items, ...items]

  return (
    <div
      style={{
        overflow: 'hidden',
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        width: '100%',
        padding: '8px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '16px',
          width: 'max-content',
          animation: `${direction === 'left' ? 'marquee-left' : 'marquee-right'} ${speed}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      >
        {repeated.map((tech, i) => (
          <TechCard
            key={`${tech.name}-${i}`}
            name={tech.name}
            color={tech.color}
            onHover={() => setPaused(true)}
            onLeave={() => setPaused(false)}
          />
        ))}
      </div>
    </div>
  )
}

const InfiniteMarquee = () => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '280px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '20px',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(99, 102, 241, 0.06) 0%, #030712 70%)',
        padding: '40px 0',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '16px',
      }}
    >
      <style>{keyframes}</style>

      {/* Subtle grid overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '8px', position: 'relative', zIndex: 2 }}>
        <h3
          style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'rgba(165, 180, 252, 0.6)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            margin: 0,
          }}
        >
          Tech Stack
        </h3>
      </div>

      {/* Row 1: scrolls left */}
      <MarqueeRow items={row1} direction="left" speed={30} />

      {/* Row 2: scrolls right */}
      <MarqueeRow items={row2} direction="right" speed={35} />

      {/* Bottom ambient glow */}
      <div
        style={{
          position: 'absolute',
          bottom: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
          height: '80px',
          background: 'radial-gradient(ellipse, rgba(99, 102, 241, 0.1), transparent)',
          pointerEvents: 'none',
          filter: 'blur(20px)',
        }}
      />
    </div>
  )
}

export default InfiniteMarquee
