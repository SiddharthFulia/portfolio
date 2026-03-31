import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { CTA } from "../components";
import { projects } from "../constants";
import { arrow } from "../assets/icons";

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
    techs: ['C', 'Alpha-Beta', 'Minimax', 'Iterative Deepening'],
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
          <div key={proj.title}
            className='relative rounded-2xl overflow-hidden border border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1'>
            {/* Gradient accent bar */}
            <div className={`h-1.5 bg-gradient-to-r ${proj.gradient}`} />

            <div className='p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start'>
              {/* Icon */}
              <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${proj.gradient} flex items-center justify-center text-3xl shadow-lg shrink-0`}>
                {proj.icon}
              </div>

              {/* Content */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-3 flex-wrap mb-2'>
                  <h3 className='font-poppins font-bold text-2xl text-black'>{proj.title}</h3>
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
                <div className='flex flex-wrap gap-3 items-center'>
                  <Link to={proj.route}
                    className='inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-sm
                               bg-gradient-to-r from-amber-500 to-orange-600 shadow-md shadow-orange-200
                               hover:scale-105 hover:shadow-lg transition-all duration-200'>
                    ▶ Visualize Live
                  </Link>
                  <a href={proj.github} target='_blank' rel='noreferrer'
                    className='inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm
                               border-2 border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50
                               hover:scale-105 transition-all duration-200'>
                    GitHub ↗
                  </a>
                  {/* Private repo info icon */}
                  <div className='relative group'>
                    <div className='w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center
                                    text-slate-400 text-sm cursor-default hover:bg-slate-200 transition-colors'>
                      i
                    </div>
                    <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs
                                    rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity
                                    duration-200 whitespace-nowrap z-10'>
                      Private repo — proprietary algorithms & logic.
                      <br />Request access via GitHub.
                      <div className='absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900' />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── All Projects ── */}
      <motion.div className='flex flex-wrap my-20 gap-16'
        initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
        {projects.map((project) => (
          <motion.div key={project.name} variants={fadeUp} className='lg:w-[400px] w-full'>
            <div className='block-container w-12 h-12'>
              <div className={`btn-back rounded-xl ${project.theme}`} />
              <div className='btn-front rounded-xl flex justify-center items-center'>
                <img src={project.iconUrl} alt={project.name} className='w-1/2 h-1/2 object-contain' />
              </div>
            </div>

            <div className='mt-5 flex flex-col'>
              <div className="flex items-center gap-3 flex-wrap">
                <h4 className='text-2xl font-poppins font-semibold'>{project.name}</h4>
                {project.tag && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                    {project.tag}
                  </span>
                )}
              </div>
              <p className='mt-2 text-slate-500'>{project.description}</p>
              <div className='mt-5 flex items-center gap-4 flex-wrap'>
                {project.link && (
                  <div className='flex items-center gap-2 font-poppins'>
                    <Link to={project.link} target='_blank' rel='noopener noreferrer'
                      className='font-semibold text-blue-600 hover:underline'>
                      {project.linkLabel}
                    </Link>
                    <img src={arrow} alt='arrow' className='w-4 h-4 object-contain' />
                  </div>
                )}
                {/* Chess Engine — Visualize + private repo note */}
                {project.name === 'Chess Engine' && (
                  <>
                    <Link to='/chess'
                      className='font-semibold text-amber-600 hover:text-amber-700 hover:underline font-poppins text-sm'>
                      ▶ Visualize Live
                    </Link>
                    <div className='relative group inline-flex'>
                      <div className='w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center
                                      text-slate-400 text-[10px] cursor-default hover:bg-slate-200 transition-colors font-serif italic'>
                        i
                      </div>
                      <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs
                                      rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity
                                      duration-200 whitespace-nowrap z-10'>
                        Private repo — proprietary algorithms.
                        <br />Request access via GitHub.
                        <div className='absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900' />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <hr className='border-slate-200' />
      <CTA />
    </section>
  );
};

export default Projects;
