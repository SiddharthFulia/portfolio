import { useMemo } from 'react'

/* ---------- helpers ---------- */
const rand = (min, max) => Math.random() * (max - min) + min

const generateStars = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand(0, 100),
    y: rand(0, 100),
    size: rand(0.5, 2),
    delay: rand(0, 5),
    duration: rand(2, 5),
    opacity: rand(0.3, 1),
  }))

/* ---------- keyframes & styles ---------- */
const css = `
/* ---- aurora keyframes ---- */
@keyframes auroraWave1 {
  0%   { transform: translateX(-5%) scaleY(1)   skewX(-3deg); opacity: 0.7; }
  25%  { transform: translateX(3%)  scaleY(1.3) skewX(2deg);  opacity: 0.9; }
  50%  { transform: translateX(8%)  scaleY(0.8) skewX(-4deg); opacity: 0.6; }
  75%  { transform: translateX(-2%) scaleY(1.1) skewX(3deg);  opacity: 0.85; }
  100% { transform: translateX(-5%) scaleY(1)   skewX(-3deg); opacity: 0.7; }
}

@keyframes auroraWave2 {
  0%   { transform: translateX(6%)  scaleY(0.9) skewX(4deg);  opacity: 0.6; }
  30%  { transform: translateX(-4%) scaleY(1.2) skewX(-2deg); opacity: 0.8; }
  60%  { transform: translateX(2%)  scaleY(0.7) skewX(5deg);  opacity: 0.55; }
  100% { transform: translateX(6%)  scaleY(0.9) skewX(4deg);  opacity: 0.6; }
}

@keyframes auroraWave3 {
  0%   { transform: translateX(-8%) scaleY(1.1) skewX(-5deg); opacity: 0.5; }
  35%  { transform: translateX(5%)  scaleY(0.85) skewX(3deg); opacity: 0.75; }
  65%  { transform: translateX(-3%) scaleY(1.25) skewX(-1deg); opacity: 0.6; }
  100% { transform: translateX(-8%) scaleY(1.1) skewX(-5deg); opacity: 0.5; }
}

@keyframes auroraWave4 {
  0%   { transform: translateX(3%)  scaleY(0.8)  skewX(2deg);  opacity: 0.45; }
  40%  { transform: translateX(-6%) scaleY(1.15) skewX(-4deg); opacity: 0.7; }
  70%  { transform: translateX(4%)  scaleY(0.95) skewX(6deg);  opacity: 0.5; }
  100% { transform: translateX(3%)  scaleY(0.8)  skewX(2deg);  opacity: 0.45; }
}

@keyframes auroraWave5 {
  0%   { transform: translateX(0%)  scaleY(1)    skewX(0deg);  opacity: 0.35; }
  20%  { transform: translateX(7%)  scaleY(1.3)  skewX(-3deg); opacity: 0.65; }
  50%  { transform: translateX(-5%) scaleY(0.75) skewX(4deg);  opacity: 0.4; }
  80%  { transform: translateX(2%)  scaleY(1.1)  skewX(-2deg); opacity: 0.55; }
  100% { transform: translateX(0%)  scaleY(1)    skewX(0deg);  opacity: 0.35; }
}

@keyframes auroraGlow {
  0%, 100% { filter: blur(40px) brightness(1); }
  50%      { filter: blur(55px) brightness(1.3); }
}

@keyframes auroraPulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}

@keyframes twinkle {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50%      { opacity: 1;   transform: scale(1.2); }
}

@keyframes shootingStar {
  0%   { transform: translateX(0) translateY(0) rotate(-35deg); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translateX(200px) translateY(120px) rotate(-35deg); opacity: 0; }
}

@keyframes mountainGlow {
  0%, 100% { opacity: 0.15; }
  50%      { opacity: 0.3; }
}

@keyframes driftUp {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-15px); }
}
`

/* ---------- aurora band configs ---------- */
const bands = [
  {
    gradient: 'linear-gradient(180deg, transparent 0%, rgba(34,197,94,0.0) 10%, rgba(34,197,94,0.35) 30%, rgba(16,185,129,0.5) 50%, rgba(34,197,94,0.25) 70%, transparent 100%)',
    animation: 'auroraWave1 12s ease-in-out infinite, auroraGlow 8s ease-in-out infinite',
    top: '5%',
    height: '55%',
  },
  {
    gradient: 'linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.0) 15%, rgba(139,92,246,0.3) 35%, rgba(168,85,247,0.45) 55%, rgba(139,92,246,0.2) 75%, transparent 100%)',
    animation: 'auroraWave2 15s ease-in-out infinite, auroraGlow 10s ease-in-out 1s infinite',
    top: '10%',
    height: '50%',
  },
  {
    gradient: 'linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.0) 12%, rgba(59,130,246,0.25) 32%, rgba(96,165,250,0.4) 52%, rgba(59,130,246,0.15) 72%, transparent 100%)',
    animation: 'auroraWave3 18s ease-in-out infinite, auroraGlow 12s ease-in-out 2s infinite',
    top: '2%',
    height: '60%',
  },
  {
    gradient: 'linear-gradient(180deg, transparent 0%, rgba(236,72,153,0.0) 18%, rgba(236,72,153,0.2) 38%, rgba(244,114,182,0.35) 50%, rgba(236,72,153,0.15) 68%, transparent 100%)',
    animation: 'auroraWave4 20s ease-in-out infinite, auroraGlow 14s ease-in-out 3s infinite',
    top: '8%',
    height: '48%',
  },
  {
    gradient: 'linear-gradient(180deg, transparent 0%, rgba(45,212,191,0.0) 20%, rgba(45,212,191,0.2) 40%, rgba(20,184,166,0.3) 55%, rgba(45,212,191,0.1) 70%, transparent 100%)',
    animation: 'auroraWave5 22s ease-in-out infinite, auroraGlow 16s ease-in-out 4s infinite',
    top: '0%',
    height: '52%',
  },
]

/* ---------- mountain SVG path ---------- */
const MountainSilhouette = () => (
  <svg
    viewBox="0 0 1440 200"
    preserveAspectRatio="none"
    style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: '100%',
      height: '160px',
      zIndex: 10,
    }}
  >
    {/* glow behind mountains */}
    <defs>
      <linearGradient id="mountainFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#030712" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#030712" stopOpacity="1" />
      </linearGradient>
      <radialGradient id="auroraReflect" cx="50%" cy="0%" r="80%">
        <stop offset="0%" stopColor="rgba(34,197,94,0.15)" />
        <stop offset="50%" stopColor="rgba(139,92,246,0.08)" />
        <stop offset="100%" stopColor="transparent" />
      </radialGradient>
    </defs>
    {/* subtle glow on horizon */}
    <rect x="0" y="0" width="1440" height="60" fill="url(#auroraReflect)" style={{ animation: 'mountainGlow 6s ease-in-out infinite' }} />
    {/* back mountain range */}
    <path
      d="M0,140 L60,110 L120,125 L200,80 L280,105 L340,65 L420,95 L480,55 L540,85 L620,50 L700,75 L760,40 L840,70 L900,45 L960,80 L1040,55 L1100,90 L1160,60 L1220,85 L1280,50 L1340,75 L1400,95 L1440,80 L1440,200 L0,200 Z"
      fill="#0a0f1a"
    />
    {/* front mountain range */}
    <path
      d="M0,170 L80,145 L160,160 L240,130 L320,155 L400,120 L480,145 L560,115 L640,140 L720,110 L800,135 L880,105 L960,130 L1040,100 L1120,125 L1200,110 L1280,135 L1360,115 L1440,140 L1440,200 L0,200 Z"
      fill="url(#mountainFill)"
    />
    {/* tree silhouettes along the base */}
    {[80, 200, 310, 450, 580, 720, 860, 990, 1100, 1250, 1370].map((x, i) => {
      const h = 18 + (i % 3) * 8
      return (
        <polygon
          key={i}
          points={`${x},${175 - h} ${x - 6},175 ${x + 6},175`}
          fill="#050a15"
        />
      )
    })}
    {/* small trees */}
    {[140, 260, 380, 510, 650, 790, 930, 1050, 1180, 1310].map((x, i) => {
      const h = 10 + (i % 2) * 5
      return (
        <polygon
          key={`s${i}`}
          points={`${x},${178 - h} ${x - 4},178 ${x + 4},178`}
          fill="#050a15"
        />
      )
    })}
  </svg>
)

/* ---------- main component ---------- */
const AuroraEffect = () => {
  const stars = useMemo(() => generateStars(120), [])
  const shootingStarDelay = useMemo(() => rand(3, 8), [])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '400px',
        background: 'radial-gradient(ellipse at 50% 0%, #0c1222 0%, #030712 60%, #010409 100%)',
        overflow: 'hidden',
        borderRadius: '12px',
      }}
    >
      <style>{css}</style>

      {/* ---- starfield ---- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        {stars.map((s) => (
          <div
            key={s.id}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              borderRadius: '50%',
              backgroundColor: '#fff',
              opacity: s.opacity,
              animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
              boxShadow: s.size > 1.3 ? '0 0 3px rgba(255,255,255,0.6)' : 'none',
            }}
          />
        ))}
      </div>

      {/* ---- shooting star ---- */}
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: '25%',
          width: '2px',
          height: '2px',
          background: 'white',
          borderRadius: '50%',
          boxShadow: '0 0 4px 2px rgba(255,255,255,0.6), -20px 0 15px 1px rgba(255,255,255,0.3)',
          zIndex: 2,
          animation: `shootingStar 1.2s ease-in ${shootingStarDelay}s infinite`,
          opacity: 0,
        }}
      />

      {/* ---- ambient horizon glow ---- */}
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          left: '-10%',
          width: '120%',
          height: '40%',
          background: 'radial-gradient(ellipse at 50% 100%, rgba(34,197,94,0.08) 0%, rgba(139,92,246,0.05) 40%, transparent 70%)',
          zIndex: 2,
          animation: 'auroraPulse 8s ease-in-out infinite',
        }}
      />

      {/* ---- aurora bands ---- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
        {bands.map((band, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '-15%',
              width: '130%',
              top: band.top,
              height: band.height,
              background: band.gradient,
              animation: band.animation,
              filter: 'blur(30px)',
              mixBlendMode: 'screen',
              willChange: 'transform, opacity',
            }}
          />
        ))}
      </div>

      {/* ---- vertical light rays (curtain effect) ---- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 4, overflow: 'hidden' }}>
        {Array.from({ length: 8 }, (_, i) => {
          const left = 10 + i * 11
          const colors = [
            'rgba(34,197,94,0.12)',
            'rgba(139,92,246,0.10)',
            'rgba(59,130,246,0.10)',
            'rgba(236,72,153,0.08)',
            'rgba(45,212,191,0.09)',
            'rgba(34,197,94,0.10)',
            'rgba(168,85,247,0.08)',
            'rgba(96,165,250,0.10)',
          ]
          return (
            <div
              key={`ray-${i}`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: '0%',
                width: '3%',
                height: '65%',
                background: `linear-gradient(180deg, transparent 0%, ${colors[i]} 30%, ${colors[i]} 60%, transparent 100%)`,
                filter: 'blur(20px)',
                animation: `driftUp ${3 + i * 0.7}s ease-in-out ${i * 0.5}s infinite alternate`,
                opacity: 0.7,
                mixBlendMode: 'screen',
              }}
            />
          )
        })}
      </div>

      {/* ---- bright core line ---- */}
      <div
        style={{
          position: 'absolute',
          top: '28%',
          left: '-5%',
          width: '110%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(34,197,94,0.4) 20%, rgba(139,92,246,0.5) 40%, rgba(59,130,246,0.4) 60%, rgba(236,72,153,0.3) 80%, transparent 100%)',
          filter: 'blur(4px)',
          zIndex: 5,
          animation: 'auroraWave1 12s ease-in-out infinite, auroraPulse 6s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />

      {/* ---- mountain silhouette ---- */}
      <MountainSilhouette />

      {/* ---- bottom vignette ---- */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '30%',
          background: 'linear-gradient(to top, #030712 0%, transparent 100%)',
          zIndex: 9,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

export default AuroraEffect
