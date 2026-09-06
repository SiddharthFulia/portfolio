import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { CTA } from "../components";
import { projects } from "../constants";

const projectCategory = (tag = '', name = '') => {
  const t = String(tag || '');
  const n = String(name || '').toLowerCase();
  if (/research|ieee|paper|accepted|published|top 3|techgium/i.test(t)) return 'Research';
  if (/production|live/i.test(t))                                       return 'Production';
  if (/ai · oss|\bai\b|\bml\b|\brag\b|\bllm\b|groq|realism/i.test(t) || /ai|ml|llm|groq|realism|prompt|whisper/i.test(n)) return 'AI · ML';
  if (/full|engine|multiplayer|suite/i.test(t) || /chess|platform/.test(n)) return 'Full-Stack';
  return 'Utilities';
};

// One curated Unsplash photo per project — real thematic image, unique
// per project. Uses Unsplash's `photo-<id>` URLs served through their CDN
// (no API key, no rate limit for hotlinking, ~50KB per image at these
// dimensions). Every project has an image mapped so nothing falls back
// to a letter/glyph.
const PROJECT_IMAGE = {
  'CrickSpeakAI':                    'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&h=500&fit=crop&auto=format',  // cricket bat + ball
  'GrabPhisher':                     'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&h=500&fit=crop&auto=format',  // blockchain/lock
  'Quantum-Resistant Cryptography':  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=500&fit=crop&auto=format',  // matrix code
  'IoT Soil Testing & Crop Recommender': 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&h=500&fit=crop&auto=format', // soil + sprout
  'Passionfruit Platform':           'https://images.unsplash.com/photo-1604909052743-94e838986d24?w=800&h=500&fit=crop&auto=format',  // passionfruit halves
  'Chess Platform':                  'https://images.unsplash.com/photo-1580541832626-2a7131ee809f?w=800&h=500&fit=crop&auto=format',  // chess board
  'LTTS Knowledge Graph':            'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=500&fit=crop&auto=format',  // network graph lights
  'realism-prompt-engine':           'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=500&fit=crop&auto=format',  // camera photorealism
  'groq-llm-router':                 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=500&fit=crop&auto=format',  // circuit / chips
  'comfyui-job-queue':               'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=800&h=500&fit=crop&auto=format',  // art palette
  'whisper-diarize-transcribe':      'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&h=500&fit=crop&auto=format',  // microphone / studio
  'rag-pdf-chat':                    'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=800&h=500&fit=crop&auto=format',  // library books
  'sd-lora-toolkit':                 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&h=500&fit=crop&auto=format',  // AI abstract
  'flux-inpaint-batch':              'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&h=500&fit=crop&auto=format',  // paint brush
  'video-frame-explainer':           'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&h=500&fit=crop&auto=format',  // film reel
  'youtube-shorts-repurposer':       'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=500&fit=crop&auto=format',  // smartphone video
  'og-image-forge':                  'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&h=500&fit=crop&auto=format',  // frames on wall
  'link-in-bio-min':                 'https://images.unsplash.com/photo-1633409361618-c73427e4e206?w=800&h=500&fit=crop&auto=format',  // chain links
  'markdown-slideshow':              'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=500&fit=crop&auto=format',  // slides / presentation
  'notion-to-static-site':           'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&h=500&fit=crop&auto=format',  // notebook
  'timezone-mate':                   'https://images.unsplash.com/photo-1501139083538-0139583c060f?w=800&h=500&fit=crop&auto=format',  // clocks
  'invoice-pdf-min':                 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=500&fit=crop&auto=format',  // receipts
  'meta-tag-audit':                  'https://images.unsplash.com/photo-1571677246347-5040036b95cc?w=800&h=500&fit=crop&auto=format',  // audit / tags
  'a11y-color-picker':               'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&h=500&fit=crop&auto=format',  // paint palette
  'sitemap-diff':                    'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&h=500&fit=crop&auto=format',  // map / geography
  'json-schema-cheatsheet':          'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&h=500&fit=crop&auto=format',  // books
  'csv-explorer-mini':               'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=500&fit=crop&auto=format',  // data charts
  'sql-formatter-lite':              'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&h=500&fit=crop&auto=format',  // database
  'regex-explainer':                 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800&h=500&fit=crop&auto=format',  // code
  'shortcut-cheatsheet':             'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&h=500&fit=crop&auto=format',  // keyboard
};

// Fallback: seeded picsum photograph for anything not in the map — real
// photo, deterministic, unique per project name.
const fallbackImage = (name) =>
  `https://picsum.photos/seed/${encodeURIComponent(name)}/800/500`;

const imageFor = (name) => PROJECT_IMAGE[name] || fallbackImage(name);

const ShareButtons = ({ url }) => {
  const [copied, setCopied] = useState(false)
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`

  const copyLink = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2 mt-4">
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="tap-44 text-fg-muted hover:text-accent-rose transition-colors"
        title="Share on LinkedIn"
        aria-label="Share on LinkedIn"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </a>
      <button
        onClick={copyLink}
        className={`tap-44 transition-colors ${copied ? 'text-accent-emerald' : 'text-fg-muted hover:text-accent-amber'}`}
        title="Copy link"
        aria-label="Copy link to clipboard"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.939a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.25" /></svg>
      </button>
    </div>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

// ── Live/featured project list (Chess engine has an interactive route) ──
const LIVE_PROJECTS = [
  {
    title: 'Chess Platform',
    tag: 'Stockfish · 10 Variants · Multiplayer · Puzzles · Openings',
    gradient: 'from-amber-500 via-orange-500 to-red-600',
    desc: 'Stockfish 17 WASM in-browser · 10 variants (Standard / 960 / KoTH / 3-Check / Atomic / Antichess / Horde / Crazyhouse / Racing Kings / Offline 2P) · 3,700+ named openings with master-game lookups · 100k tactical puzzles with per-user ELO + retry scoring · online multiplayer with takeback approval + clocks · MultiPV analysis · save-and-replay every variant · per-side auto-queen · refresh-resilient.',
    techs: ['Stockfish.js (WASM)', 'chess.js', 'chessops', 'chessground', 'React + Vite', 'Web Workers', 'SQLite', 'Express + Node', 'Recharts'],
    route: '/chess',
    github: 'https://github.com/SiddharthFulia/Chess-engine',
  },
];

// ── Small UI atom: tech tag chip ──
// Mirrors the chess-engine telemetry pills: tabular-nums, mono, subtle
// gradient backdrop, hover lifts the border. Cheap eye-candy, no JS.
const TechChip = ({ children }) => (
  <span className="border border-gray-800 bg-white/[0.03]
                   text-gray-300 px-2 py-0.5 rounded-md text-[10px] tracking-wider uppercase
                   font-medium font-mono transition-colors hover:border-amber-500/30 hover:text-amber-200">
    {children}
  </span>
);

// Section heading pill — same shape as the chess "Match active" / "Waiting"
// pills. Tailwind's JIT only picks up class strings it can see literally,
// so the dot/tone variants are concrete strings, not interpolated.
const SectionPill = ({ children, dotColor, tone = 'gray' }) => {
  const tones = {
    gray:  'border-gray-700 bg-gray-900/60 text-gray-300',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    rose:  'border-rose-500/40 bg-rose-500/10 text-rose-200',
    cyan:  'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  };
  const dots = {
    emerald: { ping: 'bg-emerald-400', solid: 'bg-emerald-500' },
    amber:   { ping: 'bg-amber-400',   solid: 'bg-amber-500'   },
    rose:    { ping: 'bg-rose-400',    solid: 'bg-rose-500'    },
    cyan:    { ping: 'bg-cyan-400',    solid: 'bg-cyan-500'    },
  };
  const d = dots[dotColor];
  return (
    <h2 className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${tones[tone] || tones.gray}
                   font-poppins font-semibold text-[11px] tracking-[0.18em] uppercase`}>
      {d && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${d.ping} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${d.solid}`} />
        </span>
      )}
      {children}
    </h2>
  );
};

// Unique gradient per project — hash the name into one of 12 curated pairs
// so no two projects share a look and re-orderings stay stable.
const GRADIENT_POOL = [
  'from-amber-500/40 via-orange-500/25 to-rose-500/30',
  'from-cyan-500/40 via-sky-500/25 to-violet-500/30',
  'from-fuchsia-500/40 via-pink-500/25 to-rose-500/30',
  'from-emerald-500/40 via-teal-500/25 to-cyan-500/30',
  'from-violet-500/40 via-fuchsia-500/25 to-pink-500/30',
  'from-indigo-500/40 via-blue-500/25 to-sky-500/30',
  'from-rose-500/40 via-red-500/25 to-orange-500/30',
  'from-lime-500/40 via-green-500/25 to-emerald-500/30',
  'from-yellow-500/40 via-amber-500/25 to-orange-500/30',
  'from-teal-500/40 via-cyan-500/25 to-blue-500/30',
  'from-purple-500/40 via-violet-500/25 to-indigo-500/30',
  'from-pink-500/40 via-fuchsia-500/25 to-purple-500/30',
];

const hashName = (s = '') => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const PreviewPlaceholder = ({ label }) => {
  const src = imageFor(label);
  return (
    <div className='w-full h-full relative overflow-hidden border-b border-[var(--luxe-border)]'>
      <img
        src={src}
        alt={label || 'project'}
        loading='lazy'
        className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
        onError={(e) => { e.currentTarget.src = fallbackImage(label || 'default'); }}
      />
      {/* Bottom-scrim gradient so any overlaid card title reads clean. */}
      <div aria-hidden className='pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent' />
    </div>
  );
};

const Projects = () => {
  const totalCount = LIVE_PROJECTS.length + projects.length;
  const [cat, setCat] = useState('All');
  // Precompute (category, project) pairs once so both the filter list and
  // the visible grid derive from the same source. Prevents "reads correct
  // count but shows wrong cards" style drift.
  const catalog = useMemo(
    () => projects.map(p => ({ ...p, __cat: projectCategory(p.tag, p.name) })),
    [],
  );
  const categories = useMemo(() => {
    const set = new Set(catalog.map(p => p.__cat));
    return ['All', ...Array.from(set)];
  }, [catalog]);
  const shown = cat === 'All' ? catalog : catalog.filter(p => p.__cat === cat);

  return (
    <section className="relative min-h-screen bg-surface-base text-fg-primary pt-24 sm:pt-28 pb-24 px-4 sm:px-8 lg:px-12 overflow-hidden">
      <div aria-hidden className="ambient-orb absolute -top-24 left-1/2 -translate-x-1/2" />
      <div aria-hidden className="ambient-orb ambient-orb-cool absolute top-1/3 -right-20 w-[420px] h-[420px] opacity-80" />

      <div className="relative max-w-[1600px] mx-auto">

        {/* ── Page header ── */}
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <p className="eyebrow-mono">
            — Work · <span className="tabular-nums">{totalCount}</span> projects
          </p>
          <h1 className="gradient-text-amber luxe-section-title text-4xl sm:text-5xl mt-3 leading-tight">
            Selected projects
          </h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-fg-secondary">
            A mix of production work, research, and full-stack experiments. Each card opens
            the live demo or repo.
          </p>
        </motion.div>

        {/* ── Live / interactive projects ── */}
        <motion.div
          className="mt-12 space-y-5"
          initial="hidden"
          whileInView="show"
          variants={stagger}
          viewport={{ once: true, amount: 0.1 }}
        >
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-3">
            <SectionPill dotColor="emerald" tone="amber">Live · Interactive</SectionPill>
            <span className="h-px flex-1 bg-amber-500/20" />
          </motion.div>

          {LIVE_PROJECTS.map(proj => (
            <motion.div key={proj.title} variants={fadeUp}>
              <div className="luxe-glass luxe-card-hover overflow-hidden flex flex-col h-full">
                {/* Left content */}
                <div className="flex-1 p-5 sm:p-6">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="text-xl font-semibold text-white">{proj.title}</h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md
                                     bg-amber-500/10 text-amber-300 border border-amber-500/20
                                     uppercase tracking-wider">
                      {proj.tag}
                    </span>
                  </div>

                  <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                    {proj.desc}
                  </p>

                  {/* Tech chips */}
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {proj.techs.map(t => (
                      <TechChip key={t}>{t}</TechChip>
                    ))}
                  </div>

                  {/* Action row */}
                  <div className="flex flex-wrap gap-2 items-center mt-5">
                    <Link to={proj.route} className="luxe-btn luxe-btn-primary">
                      Visualize Live
                    </Link>
                    <a
                      href={proj.github}
                      target="_blank"
                      rel="noreferrer"
                      className="luxe-btn luxe-btn-secondary"
                    >
                      GitHub ↗
                    </a>

                    {/* Private repo info icon */}
                    <div className="relative group">
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30
                                      flex items-center justify-center cursor-default
                                      hover:bg-amber-500/15 transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                        </svg>
                      </div>
                      <div className="absolute bottom-full right-0 sm:left-1/2 sm:-translate-x-1/2 mb-3 w-52 sm:w-56 px-3 py-2.5 bg-surface-elevated border border-line
                                      text-white text-xs rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all
                                      duration-200 scale-95 group-hover:scale-100 z-20 leading-relaxed">
                        <div className="flex items-center gap-1.5 mb-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                          <span className="font-semibold text-amber-300">Private Repository</span>
                        </div>
                        <p className="text-gray-400">Proprietary algorithms, evaluation & move generation.</p>
                        <p className="text-gray-500 mt-1">Request access via GitHub.</p>
                      </div>
                    </div>
                  </div>

                  <ShareButtons url={proj.github || window.location.href} />
                </div>

                {/* Right preview */}
                <div className="w-full sm:w-72 shrink-0 order-first sm:order-last">
                  {proj.image ? (
                    <img
                      src={proj.image}
                      alt={proj.title}
                      className="w-full h-40 sm:h-full object-cover border-b sm:border-b-0 sm:border-l border-gray-800/60"
                    />
                  ) : (
                    <PreviewPlaceholder label={proj.title} />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── All projects ──
             No framer-motion wrapping on the grid. `whileInView` with
             `once: true` was locking newly-mounted cards at opacity 0
             after a filter change — the cards were there but invisible.
             Plain divs render reliably every time. */}
        <div className="mt-10 space-y-5">
          <div className="flex items-center gap-3 mb-3 mt-4 flex-wrap">
            <SectionPill dotColor={null} tone="gray">All projects</SectionPill>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-[10px] font-mono tracking-wider text-gray-600 tabular-nums">{shown.length} / {projects.length}</span>
          </div>

          <div className="sticky top-20 sm:top-24 z-20 -mx-4 sm:-mx-8 lg:-mx-12 px-4 sm:px-8 lg:px-12 py-3 bg-[var(--luxe-bg-base)]/85 backdrop-blur border-b border-[var(--luxe-border)]/60 mb-4 flex flex-wrap items-center gap-2">
            {categories.map(c => {
              const active = c === cat;
              const count = c === 'All' ? catalog.length : catalog.filter(p => p.__cat === c).length;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500 text-black'
                      : 'bg-[color:var(--luxe-surface-hi)] text-fg-secondary hover:text-fg-primary border border-[color:var(--luxe-border)]'
                  }`}>
                  <span>{c}</span>
                  <span className={`text-[10px] font-mono tabular-nums ${active ? 'text-black/70' : 'text-fg-muted'}`}>{count}</span>
                </button>
              );
            })}
            <span className="ml-auto text-[11px] font-mono text-fg-muted tabular-nums">
              {shown.length} of {catalog.length}
            </span>
          </div>

          <div key={cat} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((project) => {
            const isChess = project.name === 'Chess Engine';
            const cardInner = (
              <div className="luxe-glass luxe-card-hover overflow-hidden flex flex-col h-full">
                {/* Left content */}
                <div className="flex-1 p-5 sm:p-6">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="text-xl font-semibold text-white">{project.name}</h3>
                    {project.tag && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md
                                       bg-amber-500/10 text-amber-300 border border-amber-500/25
                                       uppercase tracking-wider">
                        {project.tag}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                    {project.description}
                  </p>

                  {/* Action row */}
                  <div className="mt-5 flex items-center gap-2 flex-wrap">
                    {project.link && (
                      <a
                        href={project.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="luxe-btn luxe-btn-secondary"
                      >
                        {project.linkLabel} ↗
                      </a>
                    )}

                    {isChess && (
                      <>
                        <Link to="/chess" className="luxe-btn luxe-btn-primary">
                          Visualize Live
                        </Link>
                        <div className="relative group inline-flex">
                          <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30
                                          flex items-center justify-center cursor-default hover:bg-amber-500/15 transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                            </svg>
                          </div>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2 bg-surface-elevated border border-line
                                          text-white text-xs rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all
                                          duration-200 z-20 leading-relaxed">
                            <span className="font-semibold text-amber-300 flex items-center gap-1 mb-1">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                              Private Repo
                            </span>
                            <p className="text-gray-400">Request access via GitHub.</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <ShareButtons url={project.link || window.location.href} />
                </div>

                {/* Preview banner on top of card in bento layout — bigger,
                    more visual, unique gradient per project. */}
                <div className="w-full order-first relative h-32">
                  <PreviewPlaceholder label={project.name} />
                  {project.iconUrl && (
                    <img
                      src={project.iconUrl}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 m-auto w-14 h-14 object-contain opacity-90 pointer-events-none [filter:drop-shadow(0_4px_16px_rgba(0,0,0,0.4))]"
                    />
                  )}
                </div>
              </div>
            );

            return (
              <div key={project.name}>
                {cardInner}
              </div>
            );
          })}
          </div>
        </div>

        <div className="luxe-divider my-16" />
        <CTA />
      </div>
    </section>
  );
};

export default Projects;
