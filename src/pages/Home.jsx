import { useNavigate } from "react-router-dom";
import ScrollCinematicHero from "../components/ScrollCinematicHero";

// Home — the cinematic scroll hero leads the page, followed by the
// premium Linear/Vercel text-hero card so visitors immediately see
// "who" and "what" once the cinematic reveal finishes. The original
// Three.js island/plane/bird scene was moved to /3d → "Island Fly".
const Home = () => {
  const navigate = useNavigate();

  return (
    <>
      <ScrollCinematicHero />

      <section className="luxe-stage relative w-full overflow-hidden flex items-center py-24">
        <div aria-hidden className="ambient-orb absolute -top-32 left-1/2 -translate-x-1/2 opacity-70" />
        <div aria-hidden className="ambient-orb ambient-orb-cool absolute top-1/3 -right-40 opacity-60" />

        <svg
          className="pointer-events-none absolute inset-0 w-full h-full z-0"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <filter id="heroCurveGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="heroCurveStroke" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
              <stop offset="35%" stopColor="#8b5cf6" stopOpacity="0.55" />
              <stop offset="75%" stopColor="#5e6ad2" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <path
            d="M -50 820 C 280 760, 520 640, 760 440 S 1240 140, 1520 40"
            fill="none"
            stroke="url(#heroCurveStroke)"
            strokeWidth="1.6"
            strokeLinecap="round"
            filter="url(#heroCurveGlow)"
            opacity="0.85"
          />
          <path
            d="M -50 860 C 320 800, 560 700, 820 500 S 1280 200, 1560 80"
            fill="none"
            stroke="url(#heroCurveStroke)"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.35"
          />
        </svg>

        <div className="relative z-10 w-full px-6 sm:px-10 lg:px-16">
          <div className="max-w-4xl">
            <p className="eyebrow-mono mb-6 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
              Currently building · 2026
            </p>

            <h1 className="gradient-text-amber font-poppins font-black tracking-tight leading-[0.95] text-5xl sm:text-6xl md:text-7xl lg:text-8xl">
              Full-Stack
              <br />
              AI Engineer
            </h1>

            <p className="mt-7 max-w-2xl leading-relaxed text-fg-secondary text-base sm:text-lg">
              Building intelligent applications &amp; scalable solutions — full-stack engineering,
              generative AI, and 5090-powered creative tooling.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate("/projects")}
                className="luxe-btn luxe-btn-primary !px-6 !py-3 !text-sm tap-44"
              >
                View Work
                <span aria-hidden="true" className="ml-0.5">→</span>
              </button>
              <button
                onClick={() => navigate("/contact")}
                className="luxe-btn luxe-btn-secondary !px-6 !py-3 !text-sm tap-44"
              >
                Get in Touch
              </button>
              <button
                onClick={() => navigate("/3d?tab=island")}
                className="luxe-btn luxe-btn-secondary !px-6 !py-3 !text-sm tap-44"
              >
                Fly the Island
              </button>
            </div>

            <p className="text-fg-muted !text-xs mt-6 flex items-center gap-2">
              <span className="inline-block w-1 h-1 rounded-full bg-fg-muted" />
              Open to opportunities · Indo connect · Remote-friendly
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
