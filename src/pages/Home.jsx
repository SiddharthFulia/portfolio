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
    accent: "from-amber-500/20 to-rose-500/10 ring-amber-400/30",
  },
  {
    to: "/projects",
    label: "Projects",
    desc: "Shipped work — full-stack apps, AI lanes, generative tools.",
    accent: "from-cyan-500/20 to-violet-500/10 ring-cyan-400/30",
  },
  {
    to: "/contact",
    label: "Contact",
    desc: "Email me through the contact form · open to opportunities.",
    accent: "from-fuchsia-500/20 to-rose-500/10 ring-fuchsia-400/30",
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
      { to: "/hand",           label: "Hand Tracking",      desc: "50 filters · 2-hand draw · cursor · laser" },
    ],
  },
  {
    title: "Engineered",
    accent: "text-cyan-300",
    items: [
      { to: "/chess",  label: "Chess Engine", desc: "Stockfish · clocks · saved games · piece themes" },
      { to: "/runner", label: "Hand Runner",  desc: "Three.js · MediaPipe · ramps · oncoming trains" },
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
      { to: "/deepfake", label: "Deepfake Studio", desc: "Face-swap · voice-clone · Vault required", vault: true },
      { to: "/settings", label: "Settings",        desc: "Admin · monitoring · server / DB / queues", vault: true },
    ],
  },
];

const Home = () => {
  const navigate = useNavigate();

  return (
    <>
      <ScrollCinematicHero />

      <section id="below" className="relative w-full overflow-hidden bg-[#07070b] text-gray-100 px-6 sm:px-10 lg:px-16 py-20 sm:py-24 scroll-mt-20">
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

          {/* Primary trio — About / Projects / Contact, big cards. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-14">
            {PRIMARY.map((card) => (
              <button
                key={card.to}
                onClick={() => navigate(card.to)}
                className={`group relative overflow-hidden rounded-2xl p-6 text-left ring-1 transition-all bg-gradient-to-br ${card.accent} hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.4)]`}
              >
                <div className="absolute inset-0 bg-white/[0.02] group-hover:bg-white/[0.04] transition-colors" />
                <div className="relative">
                  <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-white/60 mb-3">
                    {card.to}
                  </div>
                  <h3 className="text-2xl font-poppins font-bold text-white mb-2">
                    {card.label}
                  </h3>
                  <p className="text-sm text-white/70 leading-relaxed mb-5">
                    {card.desc}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 group-hover:text-white">
                    Open <ArrowRightOutlined className="text-[12px] transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Tools grid — every AI lane + engineered build + tool, grouped. */}
          <div className="mt-16 space-y-12">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className={`text-[11px] uppercase tracking-[0.22em] font-bold mb-4 ${g.accent}`}>
                  {g.title}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.items.map((it) => (
                    <button
                      key={it.to}
                      onClick={() => navigate(it.to)}
                      className="group text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 px-5 py-4 transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-[15px] font-semibold text-white group-hover:text-amber-200 transition-colors">
                          {it.label}
                        </h4>
                        {it.vault && (
                          <LockOutlined
                            className="text-[10px] text-fuchsia-400"
                            title="Vault password required"
                          />
                        )}
                      </div>
                      <p className="text-[12px] text-gray-400 leading-relaxed">
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
