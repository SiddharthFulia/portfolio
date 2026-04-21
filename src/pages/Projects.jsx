import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { CTA } from "../components";
import { projects } from "../constants";
import { arrow } from "../assets/icons";
import AnimatedCard from '../components/explore/AnimatedCard';

const ShareButtons = ({ title, url }) => {
  const [copied, setCopied] = useState(false)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`

  const copyLink = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2 mt-2">
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-cyan-400 transition-colors" title="Share on X">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
      <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 transition-colors" title="Share on LinkedIn">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </a>
      <button onClick={copyLink} className={`transition-colors ${copied ? 'text-green-400' : 'text-gray-500 hover:text-white'}`} title="Copy link">
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

const Projects = () => {
  return (
    <section className='max-container'>
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <h1 className='head-text'>
          My{" "}
          <span className='blue-gradient_text drop-shadow font-semibold'>Projects</span>
        </h1>

        <p className='text-slate-500 mt-2 leading-relaxed'>
          From AI-powered cricket analytics to quantum-resistant cryptography and
          blockchain phishing detection — each project is backed by real research or
          production deployment. Click any card to explore.
        </p>
      </motion.div>

      {/* ── Live Projects — Visualize ── */}
      <motion.div className='mt-12' initial="hidden" whileInView="show" variants={fadeUp} viewport={{ once: true }}>
        <div className='flex items-center gap-3 mb-6'>
          <span className='relative flex h-3 w-3'>
            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75' />
            <span className='relative inline-flex rounded-full h-3 w-3 bg-green-500' />
          </span>
          <h2 className='font-poppins font-bold text-xl text-black'>Live Projects — Visualize</h2>
          <span className='text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200'>
            Interactive
          </span>
        </div>

        {LIVE_PROJECTS.map(proj => (
          <AnimatedCard key={proj.title} effect='fire'>
          <div
            className='relative rounded-2xl overflow-hidden border border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1'>
            {/* Gradient accent bar */}
            <div className={`h-1.5 bg-gradient-to-r ${proj.gradient}`} />

            <div className='p-4 sm:p-6 md:p-8 flex flex-col md:flex-row gap-4 sm:gap-6 items-start'>
              {/* Icon */}
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br ${proj.gradient} flex items-center justify-center text-2xl sm:text-3xl shadow-lg shrink-0`}>
                {proj.icon}
              </div>

              {/* Content */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 sm:gap-3 flex-wrap mb-2'>
                  <h3 className='font-poppins font-bold text-xl sm:text-2xl text-black'>{proj.title}</h3>
                  <span className='text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200'>
                    {proj.tag}
                  </span>
                </div>
                <p className='text-slate-500 text-sm leading-relaxed mb-4'>{proj.desc}</p>

                {/* Tech tags */}
                <div className='flex flex-wrap gap-1.5 mb-5'>
                  {proj.techs.map(t => (
                    <span key={t} className='px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full'>
                      {t}
                    </span>
                  ))}
                </div>

                {/* Action buttons */}
                <div className='flex flex-wrap gap-2 sm:gap-3 items-center'>
                  <Link to={proj.route}
                    className='inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-white text-xs sm:text-sm
                               bg-gradient-to-r from-amber-500 to-orange-600 shadow-md shadow-orange-200
                               hover:scale-105 hover:shadow-lg transition-all duration-200'>
                    ▶ Visualize Live
                  </Link>
                  <a href={proj.github} target='_blank' rel='noreferrer'
                    className='inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-semibold text-xs sm:text-sm
                               border-2 border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50
                               hover:scale-105 transition-all duration-200'>
                    GitHub ↗
                  </a>
                  {/* Private repo info icon */}
                  <div className='relative group'>
                    <div className='w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center
                                    cursor-default hover:bg-amber-100 hover:border-amber-300 transition-all duration-200'>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                      </svg>
                    </div>
                    <div className='absolute bottom-full right-0 sm:left-1/2 sm:-translate-x-1/2 mb-3 w-52 sm:w-56 px-3 sm:px-4 py-3 bg-gray-900 text-white text-xs
                                    rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all
                                    duration-200 scale-95 group-hover:scale-100 z-20 leading-relaxed'>
                      <div className='flex items-center gap-1.5 mb-1.5'>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        <span className='font-bold text-amber-400'>Private Repository</span>
                      </div>
                      <p className='text-gray-400'>Proprietary algorithms, evaluation & move generation.</p>
                      <p className='text-gray-500 mt-1'>Request access via GitHub.</p>
                      <div className='absolute top-full right-3 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto border-[6px] border-transparent border-t-gray-900' />
                    </div>
                  </div>
                </div>
                <ShareButtons title={proj.title} url={proj.github || window.location.href} />
              </div>
            </div>
          </div>
          </AnimatedCard>
        ))}
      </motion.div>

      {/* ── All Projects ── */}
      <motion.div className='flex flex-wrap my-20 gap-16'
        initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
        {projects.map((project, idx) => {
          const effects = ['water', 'electric', 'psychic', 'fire', 'grass', 'dragon', 'ice', 'dark', 'ghost', 'poison']
          return (
          <motion.div key={project.name} variants={fadeUp} className='lg:w-[400px] w-full'>
            <AnimatedCard effect={effects[idx % effects.length]}>
            <div className="p-5">
            <div className='block-container w-12 h-12'>
              <div className={`btn-back rounded-xl ${project.theme}`} />
              <div className='btn-front rounded-xl flex justify-center items-center'>
                <img src={project.iconUrl} alt={project.name} className='w-1/2 h-1/2 object-contain' />
              </div>
            </div>

            <div className='mt-5 flex flex-col'>
              <div className="flex items-center gap-3 flex-wrap">
                <h4 className='text-2xl font-poppins font-semibold text-white'>{project.name}</h4>
                {project.tag && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/30">
                    {project.tag}
                  </span>
                )}
              </div>
              <p className='mt-2 text-gray-400'>{project.description}</p>
              <div className='mt-5 flex items-center gap-4 flex-wrap'>
                {project.link && (
                  <div className='flex items-center gap-2 font-poppins'>
                    <Link to={project.link} target='_blank' rel='noopener noreferrer'
                      className='font-semibold text-blue-400 hover:underline'>
                      {project.linkLabel}
                    </Link>
                    <img src={arrow} alt='arrow' className='w-4 h-4 object-contain' />
                  </div>
                )}
                {/* Chess Engine — Visualize + private repo note */}
                {project.name === 'Chess Engine' && (
                  <>
                    <Link to='/chess'
                      className='font-semibold text-amber-400 hover:text-amber-300 hover:underline font-poppins text-sm'>
                      ▶ Visualize Live
                    </Link>
                    <div className='relative group inline-flex'>
                      <div className='w-6 h-6 rounded-full bg-amber-900/30 border-2 border-amber-700/40 flex items-center justify-center
                                      cursor-default hover:bg-amber-900/50 transition-all'>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                        </svg>
                      </div>
                      <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2.5 bg-gray-900 text-white text-xs
                                      rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all
                                      duration-200 z-20 leading-relaxed'>
                        <span className='font-bold text-amber-400 flex items-center gap-1 mb-1'>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                          Private Repo
                        </span>
                        <p className='text-gray-400'>Request access via GitHub.</p>
                        <div className='absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900' />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <ShareButtons title={project.name} url={project.link || window.location.href} />
            </div>
            </div>
            </AnimatedCard>
          </motion.div>
          )
        })}
      </motion.div>

      <hr className='border-slate-200' />
      <CTA />
    </section>
  );
};

export default Projects;
