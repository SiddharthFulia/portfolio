import { useNavigate } from "react-router-dom";
import { LockOutlined, ArrowRightOutlined } from "@ant-design/icons";
import ScrollCinematicHero from "../components/ScrollCinematicHero";

// Below-hero "directory" — three big primary cards (About / Projects /
// Contact) on top, then every AI lane + engineered build + tool laid
// out in groups so visitors can see them all on page one. Mirrors the
// Navbar's More dropdown so nothing is hidden behind a menu.
const PRIMARY = [
  {
    to: "/about",
    label: "About",
    desc: "Experience, GitHub heatmap, terminal — the engineer behind the work.",
    badge: "/about",
    gradient: "from-amber-500/35 via-orange-500/20 to-rose-500/25",
    ring: "ring-amber-400/60 group-hover:ring-amber-300",
    glow: "shadow-[0_0_60px_-12px_rgba(245,158,11,0.55)] group-hover:shadow-[0_0_80px_-12px_rgba(245,158,11,0.8)]",
    dot: "bg-amber-300",
  },
  {
    to: "/projects",
    label: "Projects",
    desc: "Shipped work — full-stack apps, AI lanes, generative tools.",
    badge: "/projects",
    gradient: "from-cyan-500/35 via-sky-500/20 to-violet-500/25",
    ring: "ring-cyan-400/60 group-hover:ring-cyan-300",
    glow: "shadow-[0_0_60px_-12px_rgba(34,211,238,0.55)] group-hover:shadow-[0_0_80px_-12px_rgba(34,211,238,0.8)]",
    dot: "bg-cyan-300",
  },
  {
    to: "/contact",
    label: "Contact",
    desc: "Email me through the contact form · open to opportunities.",
    badge: "/contact",
    gradient: "from-fuchsia-500/35 via-pink-500/20 to-rose-500/25",
    ring: "ring-fuchsia-400/60 group-hover:ring-fuchsia-300",
    glow: "shadow-[0_0_60px_-12px_rgba(232,121,249,0.55)] group-hover:shadow-[0_0_80px_-12px_rgba(232,121,249,0.85)]",
    dot: "bg-fuchsia-300",
  },
];

const GROUPS = [
  {
    title: "AI Studios",
    accent: "text-amber-300",
    items: [
      { to: "/ai-video",       label: "AI Video Studio",    desc: "T2V · I2V · ZSky / LTX / Wan / Hunyuan" },
      { to: "/image-enhancer", label: "Image Studio",       desc: "Enhance · Fast Gen · T2I · Vision" },
      { to: "/audio",          label: "Audio Studio",       desc: "Music · TTS · STT · Voice clone · Lip sync" },
      { to: "/ai",             label: "AI Chat",            desc: "Groq · Beast (Ollama 5090) · multimodal" },
      { to: "/3d",             label: "3D Studio",          desc: "Generate · Studio Pro · Library · Visualize · Island Fly" },
      { to: "/cinema",         label: "Cinema",             desc: "Multi-shot AI cinema with planner + render queue" },
      { to: "/showreel",       label: "Showreel",           desc: "Cinematic chapter reel of the live AI stack" },
      { to: "/splat",          label: "Splat Viewer",       desc: "Walk through any Gaussian splat in the browser" },
      { to: "/room",           label: "Room Designer",      desc: "Video → analysis → furniture → MP4 · V1 UI" },
    ],
  },
  {
    title: "Engineered",
    accent: "text-cyan-300",
    items: [
      { to: "/chess",       label: "Chess Engine",  desc: "Stockfish · clocks · saved games · piece themes" },
      { to: "/simple-game", label: "Simple Games",  desc: "Snake · code + live game · step through algorithms" },
      { to: "/physics",     label: "Physics Lab",   desc: "N-body double pendulum · Lagrangian mechanics · chaos" },
      { to: "/pathfinding", label: "Pathfinding",   desc: "Dijkstra · A* · BFS · DFS · Bidi on live BLR OSM roads" },
      { to: "/osint",       label: "OSINT Powerhouse", desc: "150+ intel APIs · live earthquakes / fires / ISS / breaches" },
    ],
  },
  {
    title: "Hand Gesture",
    accent: "text-fuchsia-300",
    items: [
      { to: "/runner",         label: "Hand Runner",   desc: "Three.js runner · lane by hand, jump by palm" },
      { to: "/hand",           label: "Hand Tracking", desc: "50 filters · 2-hand draw · cursor · laser" },
      { to: "/gesture-memes",  label: "Gesture Memes", desc: "11 gestures → cat memes · MediaPipe in-browser" },
      { to: "/gesture-hammy",  label: "Hammy Hamster", desc: "15 face + hand + pose gestures → hamster memes" },
    ],
  },
  {
    title: "Others",
    accent: "text-emerald-300",
    items: [
      { to: "/lab",        label: "Interactive Lab", desc: "17 mini-demos · 7 categories" },
      { to: "/creative",   label: "Creative UI",     desc: "13 UI experiments" },
      { to: "/learn",      label: "Learn DSA",       desc: "Algorithms · system design · CP" },
      { to: "/science",    label: "Explore Space",   desc: "11 NASA modules · APOD · Mars · Asteroids" },
      { to: "/explore",    label: "Web Playground",  desc: "9 APIs · Pokémon · Memes · Countries · Quotes" },
      { to: "/summarizer", label: "Summarizer",      desc: "Paste long text · get a tight summary" },
      { to: "/yt-dl",      label: "YouTube DL",      desc: "Paste a YouTube link · get MP3 or MP4" },
    ],
  },
  {
    title: "Vault",
    accent: "text-fuchsia-300",
    items: [
      { to: "/deepfake", label: "Persona Studio", desc: "Face-swap · voice-clone · Vault required", vault: true },
      { to: "/settings", label: "Settings",        desc: "Admin · monitoring · server / DB / queues", vault: true },
    ],
  },
];

const Home = () => {
  const navigate = useNavigate();

  return (
    <>
      <ScrollCinematicHero />

      <section id="below" className="relative w-full overflow-hidden bg-[var(--luxe-bg-base)] text-fg-primary px-6 sm:px-10 lg:px-16 py-20 sm:py-24 scroll-mt-20">
        <div aria-hidden className="ambient-orb absolute -top-32 left-1/2 -translate-x-1/2 opacity-60" />
        <div aria-hidden className="ambient-orb ambient-orb-cool absolute top-1/3 -right-40 opacity-50" />

        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <p className="eyebrow-mono mb-5 flex items-center gap-2 text-amber-300/90">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Currently building · 2026
            </p>
            <h2 className="gradient-text-amber font-poppins font-black tracking-tight leading-[0.95] text-4xl sm:text-5xl md:text-6xl">
              Full-Stack
              <br />
              AI Engineer
            </h2>
            <p className="mt-6 max-w-2xl leading-relaxed text-gray-300 text-base sm:text-lg">
              Building intelligent applications &amp; scalable solutions —
              full-stack engineering and generative AI.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/resume.pdf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm shadow-[0_8px_32px_rgba(245,158,11,0.35)] transition-all min-h-[44px]"
              >
                Resume
                <ArrowRightOutlined className="text-[12px]" />
              </a>
              <button
                onClick={() => navigate("/contact")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 bg-white/[0.04] backdrop-blur text-white/90 hover:text-white hover:border-white/40 font-semibold text-sm transition-all min-h-[44px]"
              >
                Get in Touch
              </button>
            </div>
          </div>

          {/* Primary trio — About / Projects / Contact. Promoted to
              full-bleed glow cards so they pull the eye on first
              paint. Bigger type, brighter rings, color-matched glow. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-10 sm:mt-14">
            {PRIMARY.map((card) => (
              <button
                key={card.to}
                onClick={() => navigate(card.to)}
                className={`group relative overflow-hidden rounded-3xl p-5 sm:p-8 text-left ring-2 transition-all duration-300
                            bg-gradient-to-br ${card.gradient}
                            ${card.ring} ${card.glow}
                            hover:-translate-y-1.5 min-h-[160px] sm:min-h-[220px]`}
              >
                {/* Soft white wash + sheen */}
                <div className="absolute inset-0 bg-white/[0.04] group-hover:bg-white/[0.07] transition-colors" />
                <div aria-hidden className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-white/10 blur-3xl opacity-50 group-hover:opacity-70 transition-opacity" />

                <div className="relative h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`w-2 h-2 rounded-full ${card.dot} animate-pulse`} />
                    <span className="text-[10px] font-mono uppercase tracking-[0.32em] text-white/80">
                      {card.badge}
                    </span>
                  </div>

                  <h3 className="text-3xl sm:text-4xl font-poppins font-black tracking-tight text-white mb-3 [text-shadow:0_2px_18px_rgba(0,0,0,0.45)]">
                    {card.label}
                  </h3>

                  <p className="text-[15px] text-white/85 leading-relaxed mb-6 flex-1">
                    {card.desc}
                  </p>

                  <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
                    Open
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/15 group-hover:bg-white/25 transition-all">
                      <ArrowRightOutlined className="text-[12px] transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Tools grid — every AI lane + engineered build + tool, grouped. */}
          <div className="mt-14 sm:mt-16 space-y-8 sm:space-y-10">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className={`text-[11px] uppercase tracking-[0.22em] font-bold mb-3 sm:mb-4 ${g.accent}`}>
                  {g.title}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  {g.items.map((it) => (
                    <button
                      key={it.to}
                      onClick={() => navigate(it.to)}
                      className="luxe-glass group text-left px-3.5 py-3 sm:px-4 sm:py-3.5 transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                        <h4 className="text-[13px] sm:text-[14px] font-semibold text-white group-hover:text-amber-200 transition-colors line-clamp-1">
                          {it.label}
                        </h4>
                        {it.vault && (
                          <LockOutlined
                            className="text-[10px] text-fuchsia-400 shrink-0"
                            title="Vault password required"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">
                        {it.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-14 text-xs text-gray-500 flex items-center gap-2">
            <span className="inline-block w-1 h-1 rounded-full bg-gray-500" />
            Open to opportunities · Indo connect · Remote-friendly
          </p>
        </div>
      </section>
    </>
  );
};

export default Home;
