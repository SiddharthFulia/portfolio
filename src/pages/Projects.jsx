import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { CTA } from "../components";
import { projects } from "../constants";

const ShareButtons = ({ title, url }) => {
  const [copied, setCopied] = useState(false)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
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
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-gray-500 hover:text-violet-300 transition-colors"
        title="Share on X"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-gray-500 hover:text-violet-300 transition-colors"
        title="Share on LinkedIn"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </a>
      <button
        onClick={copyLink}
        className={`transition-colors ${copied ? 'text-emerald-400' : 'text-gray-500 hover:text-violet-300'}`}
        title="Copy link"
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
    icon: '♟',
    title: 'Chess Engine',
    tag: 'Systems · C',
    gradient: 'from-amber-500 via-orange-500 to-red-600',
    desc: 'Full chess engine with alpha-beta pruning, iterative deepening, piece-square tables, and 10×12 board representation. Play against the AI live in your browser.',
    techs: ['C', 'Alpha-Beta', 'Iterative Deepening', 'Quiescence Search', 'MVV-LVA', 'Delta Pruning', 'Piece-Square Tables'],
    route: '/chess',
    github: 'https://github.com/SiddharthFulia/Chess-engine',
  },
];

// ── Small UI atom: tech tag chip ──
const TechChip = ({ children }) => (
  <span className="border border-gray-800 bg-white/[0.03] text-gray-300 px-2 py-0.5 rounded-md text-[10px] tracking-wider uppercase font-medium">
    {children}
  </span>
);

// ── Small UI atom: preview placeholder (used when project has no image) ──
const PreviewPlaceholder = ({ label, gradient }) => {
  // Make a short label (initials or emoji) to render in the placeholder
  const short = (label || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className={`w-full h-40 sm:h-full sm:min-h-[180px] flex items-center justify-center
                  bg-gradient-to-br ${gradient || 'from-violet-500/20 via-indigo-500/10 to-cyan-500/20'}
                  border-l border-gray-800/60 relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(139,92,246,0.18),transparent_60%)]" />
      <span className="relative font-poppins text-3xl sm:text-4xl font-bold text-white/80 tracking-wider select-none">
        {short || '◆'}
      </span>
    </div>
  );
};

const Projects = () => {
  const totalCount = LIVE_PROJECTS.length + projects.length;

  return (
    <section className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-28 pb-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">

        {/* ── Page header ── */}
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <p className="luxe-eyebrow text-violet-300/80">— Work · {totalCount} projects</p>
          <h1 className="luxe-section-title text-4xl sm:text-5xl text-white mt-3">
            Selected projects
          </h1>
          <p className="luxe-body-muted mt-3 max-w-xl">
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
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h2 className="font-poppins font-semibold text-sm tracking-wider uppercase text-gray-400">
              Live · Interactive
            </h2>
          </motion.div>

          {LIVE_PROJECTS.map(proj => (
            <motion.div key={proj.title} variants={fadeUp}>
              <div className="luxe-card luxe-card-hover overflow-hidden flex flex-col sm:flex-row">
                {/* Left content */}
                <div className="flex-1 p-6">
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
                      ▶ Visualize Live
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
                      <div className="absolute bottom-full right-0 sm:left-1/2 sm:-translate-x-1/2 mb-3 w-52 sm:w-56 px-3 py-2.5 bg-[#0a0a0e] border border-gray-800
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

                  <ShareButtons title={proj.title} url={proj.github || window.location.href} />
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
                    <PreviewPlaceholder label={proj.title} gradient={`${proj.gradient ? `from-amber-500/25 via-orange-500/15 to-red-600/25` : ''}`} />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── All projects ── */}
        <motion.div
          className="mt-10 space-y-5"
          initial="hidden"
          whileInView="show"
          variants={stagger}
          viewport={{ once: true, amount: 0.05 }}
        >
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-2 mt-4">
            <h2 className="font-poppins font-semibold text-sm tracking-wider uppercase text-gray-400">
              All projects
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-gray-800 to-transparent" />
          </motion.div>

          {projects.map((project) => {
            const isChess = project.name === 'Chess Engine';
            const cardInner = (
              <div className="luxe-card luxe-card-hover overflow-hidden flex flex-col sm:flex-row">
                {/* Left content */}
                <div className="flex-1 p-6">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="text-xl font-semibold text-white">{project.name}</h3>
                    {project.tag && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md
                                       bg-violet-500/10 text-violet-300 border border-violet-500/25
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
                          ▶ Visualize Live
                        </Link>
                        <div className="relative group inline-flex">
                          <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30
                                          flex items-center justify-center cursor-default hover:bg-amber-500/15 transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                            </svg>
                          </div>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2 bg-[#0a0a0e] border border-gray-800
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

                  <ShareButtons title={project.name} url={project.link || window.location.href} />
                </div>

                {/* Right preview */}
                <div className="w-full sm:w-72 shrink-0 order-first sm:order-last">
                  {project.iconUrl ? (
                    <div className="w-full h-40 sm:h-full sm:min-h-[180px] relative overflow-hidden
                                    bg-gradient-to-br from-violet-500/15 via-indigo-500/8 to-cyan-500/15
                                    border-b sm:border-b-0 sm:border-l border-gray-800/60 flex items-center justify-center">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(139,92,246,0.16),transparent_60%)]" />
                      <img
                        src={project.iconUrl}
                        alt={project.name}
                        className="relative w-16 h-16 object-contain opacity-90"
                      />
                    </div>
                  ) : (
                    <PreviewPlaceholder label={project.name} />
                  )}
                </div>
              </div>
            );

            return (
              <motion.div key={project.name} variants={fadeUp}>
                {cardInner}
              </motion.div>
            );
          })}
        </motion.div>

        <div className="luxe-divider my-16" />
        <CTA />
      </div>
    </section>
  );
};

export default Projects;
