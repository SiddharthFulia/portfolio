import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";
import { motion } from "framer-motion";
import "react-vertical-timeline-component/style.min.css";

import { useState } from "react";
import { CTA } from "../components";
import { experiences, skills, publications, achievements, competitiveProgramming } from "../constants";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const EXPERTISE = [
  {
    id: 'backend',
    icon: '⚙️',
    title: 'Backend Architecture',
    color: 'from-blue-600 to-cyan-500',
    tags: ['Node.js', 'Express.js', 'REST APIs', 'RabbitMQ', 'Redis', 'PM2'],
    summary: 'Built 100+ production REST APIs powering analytics, reporting, and AI-driven insights at scale.',
    details: [
      'Designed scalable microservice architecture with Express.js handling 10K+ requests/day',
      'Engineered RabbitMQ job queues with retry logic, dead-letter exchanges, and fail-safe execution for 10K+ daily jobs',
      'Implemented Redis caching layer — reduced API latency by 40% across critical endpoints',
      'Built automated email reporting pipeline via Mailgun delivering scheduled digests to 30+ stakeholders',
      'Set up PM2 process management with zero-downtime deployments and health monitoring',
    ],
  },
  {
    id: 'frontend',
    icon: '🎨',
    title: 'Frontend & UI',
    color: 'from-purple-600 to-pink-500',
    tags: ['React', 'Next.js 15', 'TailwindCSS', 'Ant Design', 'MUI', 'Framer Motion', 'Three.js'],
    summary: 'Pixel-perfect responsive interfaces with 3D effects, complex data dashboards, and rich text editors.',
    details: [
      'Built production Next.js 15 app with App Router, Server Components, and ISR for a multi-tenant analytics platform',
      'Implemented complex data visualization dashboards with Chart.js and Tremor for real-time analytics',
      'Integrated TipTap rich text editor for content management with custom extensions',
      'Created interactive 3D experiences with Three.js — solar systems, particle fields, gravity simulations',
      'Designed responsive layouts with TailwindCSS + Ant Design component library across 50+ pages',
    ],
  },
  {
    id: 'ai',
    icon: '🤖',
    title: 'AI & ML Systems',
    color: 'from-green-600 to-emerald-500',
    tags: ['LangChain', 'OpenAI API', 'Anthropic SDK', 'Google Vertex AI', 'PyTorch', 'GNNs'],
    summary: 'From LLM-powered product features to graph neural networks for blockchain security research.',
    details: [
      'Integrated LangChain + LangGraph for AI-driven content analysis and automated insights generation',
      'Built production AI features using OpenAI API, Anthropic SDK, and Google Vertex AI',
      'Developed Graph Neural Network models (PyTorch) for blockchain phishing detection at IIT Patna — 96.7% F1',
      'Implemented quantum-resistant cryptographic protocols for post-quantum blockchain security',
      'Designed AI-powered analytics pipelines processing data from Google Search Console + GA4',
    ],
  },
  {
    id: 'database',
    icon: '🗄️',
    title: 'Databases & Data',
    color: 'from-orange-600 to-yellow-500',
    tags: ['MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Google BigQuery', 'Knex.js'],
    summary: 'Multi-database architecture with optimized queries, indexing strategies, and cloud data warehousing.',
    details: [
      'Designed MongoDB schemas with compound indexes, aggregation pipelines, and change streams',
      'Built PostgreSQL + Knex.js query builder layer for structured analytics data',
      'Integrated Google Cloud BigQuery for large-scale data warehousing and analytical queries',
      'Implemented Redis for session management, rate limiting, and API response caching',
      'Optimized database performance via strategic indexing, pagination, and query profiling — 40% latency reduction',
    ],
  },
  {
    id: 'devops',
    icon: '🐳',
    title: 'DevOps & Cloud',
    color: 'from-cyan-600 to-blue-500',
    tags: ['Docker', 'Google Cloud', 'Puppeteer', 'Node-cron', 'CI/CD'],
    summary: 'Containerized deployments, automated scraping pipelines, and scheduled cloud workflows.',
    details: [
      'Containerized services with Docker for consistent dev/staging/production environments',
      'Built automated web scraping pipelines with Puppeteer for competitive intelligence data',
      'Engineered Node-cron scheduled jobs for automated report generation and data sync',
      'Set up Google Cloud infrastructure — BigQuery, Vertex AI, and Cloud Storage',
      'Implemented CI/CD pipelines with automated testing and zero-downtime deployment strategies',
    ],
  },
  {
    id: 'sysdesign',
    icon: '🏗️',
    title: 'System Design',
    color: 'from-red-600 to-rose-500',
    tags: ['Microservices', 'Message Queues', 'Caching', 'Rate Limiting', 'API Design'],
    summary: 'Designed distributed systems handling 10K+ daily jobs with fault tolerance and horizontal scalability.',
    details: [
      'Architected event-driven microservices with RabbitMQ message queues for async job processing',
      'Designed multi-layer caching strategy: Redis L1 cache + CDN L2 + browser cache headers',
      'Implemented rate limiting, request throttling, and circuit breaker patterns for API resilience',
      'Built automated retry mechanisms with exponential backoff and dead-letter queue handling',
      'Designed RESTful API contracts with versioning, pagination, filtering, and comprehensive error handling',
    ],
  },
];

function ExpertiseCard({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div variants={fadeUp}>
      <div
        className={`bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden
                     transition-all duration-300 ${open ? 'shadow-xl ring-2 ring-blue-100' : 'hover:-translate-y-1 hover:shadow-lg'}`}
      >
        {/* Header — always visible, clickable */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full text-left"
        >
          <div className={`bg-gradient-to-r ${item.color} p-5 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{item.icon}</span>
              <div>
                <h4 className="text-white font-poppins font-bold text-lg">{item.title}</h4>
                <p className="text-white/80 text-xs mt-0.5 max-w-md">{item.summary}</p>
              </div>
            </div>
            <span className={`text-white text-xl transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
          </div>
        </button>

        {/* Tags — always visible */}
        <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-slate-100">
          {item.tags.map(t => (
            <span key={t} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
              {t}
            </span>
          ))}
        </div>

        {/* Expandable details */}
        <div
          className="overflow-hidden transition-all duration-500 ease-in-out"
          style={{ maxHeight: open ? '600px' : '0px', opacity: open ? 1 : 0 }}
        >
          <ul className="p-5 space-y-3">
            {item.details.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
                <span className="text-blue-500 mt-0.5 shrink-0">▸</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

const About = () => {
  return (
    <section className='max-container'>

      {/* ── Header ── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <h1 className='head-text'>
          Hello, I'm{" "}
          <span className='blue-gradient_text font-semibold drop-shadow'>Siddharth</span> 👋
        </h1>
        <div className='mt-5 flex flex-col gap-3 text-slate-500'>
          <p>
            Founding Engineer & ML Researcher based in Mumbai, India. I build scalable
            full-stack products and AI-driven systems — from 100+ REST APIs at{" "}
            <a href="https://www.linkedin.com/company/getpassionfruit/posts/?feedView=all"
               target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-medium">
              Passionfruit (NY)
            </a>{" "}
            to graph neural networks for blockchain phishing detection at{" "}
            <a href="https://www.iitp.ac.in" target="_blank" rel="noreferrer"
               className="text-blue-500 hover:underline font-medium">IIT Patna</a>.{" "}
            B.Tech CE from DJS College (CGPA 9.1), 3 research publications, Meta Hacker Cup 2025{" "}
            <a href="https://www.linkedin.com/posts/siddharth-fulia_metahackercup2025-top200-round3-activity-7432281275920728066-5b8P?utm_source=share&utm_medium=member_desktop&rcm=ACoAADbS-ywBYuwbaIFL7brrtMs_7hHq9KiB_bw"
               target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-medium">
              Global Rank 186
            </a>, and CodeChef 5★ (2114 rating).
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/resume.pdf" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white
                       bg-gradient-to-r from-[#00c6ff] to-[#0072ff] shadow-md
                       hover:scale-105 hover:shadow-lg transition-transform duration-200">
            📄 View / Download Resume
          </a>
          <a href="https://www.linkedin.com/in/siddharth-fulia/" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold
                       border-2 border-blue-500 text-blue-600 hover:bg-blue-50
                       hover:scale-105 transition-transform duration-200">
            💼 LinkedIn Profile
          </a>
        </div>
      </motion.div>

      {/* ── Work Experience ── */}
      <div className='py-16'>
        <motion.h3 className='subhead-text' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>Work Experience.</motion.h3>
        <motion.p className='mt-5 text-slate-500' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>
          Cutting-edge companies and research labs where I've shipped real impact:
        </motion.p>
        <div className='mt-12 flex'>
          <VerticalTimeline>
            {experiences.map((exp) => (
              <VerticalTimelineElement key={exp.company_name} date={exp.date}
                iconStyle={{ background: exp.iconBg }}
                icon={
                  <div className='flex justify-center items-center w-full h-full'>
                    <img src={exp.icon} alt={exp.company_name} className='w-[60%] h-[60%] object-contain' />
                  </div>
                }
                contentStyle={{ borderBottom: "8px", borderStyle: "solid", borderBottomColor: exp.iconBg, boxShadow: "none" }}>
                <div>
                  <h3 className='text-black text-xl font-poppins font-semibold'>{exp.title}</h3>
                  <a href={exp.company_link} target="_blank" rel="noreferrer"
                    className='text-blue-500 font-medium text-base hover:underline' style={{ margin: 0 }}>
                    {exp.company_name} ↗
                  </a>
                </div>
                <ul className='my-5 list-disc ml-5 space-y-2'>
                  {exp.points.map((point, i) => (
                    <li key={i} className='text-black-500/50 font-normal pl-1 text-sm'>{point}</li>
                  ))}
                </ul>
              </VerticalTimelineElement>
            ))}
          </VerticalTimeline>
        </div>
      </div>

      {/* ── Tech Expertise ── */}
      <div className='py-16'>
        <motion.h3 className='subhead-text' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>What I Build.</motion.h3>
        <motion.p className='mt-5 text-slate-500' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>
          Real-world systems I've designed and shipped — click each to see details.
        </motion.p>
        <motion.div className='mt-12 grid grid-cols-1 md:grid-cols-2 gap-6'
          initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
          {EXPERTISE.map(item => (
            <ExpertiseCard key={item.id} item={item} />
          ))}
        </motion.div>
      </div>

      {/* ── Research & Publications ── */}
      <div className='py-16'>
        <motion.h3 className='subhead-text' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>Research & Publications.</motion.h3>
        <motion.p className='mt-5 text-slate-500' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>
          3 papers published / accepted in international journals and conferences.
        </motion.p>
        <motion.div className='mt-12 flex flex-col gap-8'
          initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
          {publications.map((pub) => {
            const CardWrapper = pub.link
              ? ({ children }) => (
                  <a href={pub.link} target="_blank" rel="noreferrer" className="block group">{children}</a>
                )
              : ({ children }) => <div className="group">{children}</div>;

            return (
              <motion.div key={pub.title} variants={fadeUp}>
                <CardWrapper>
                  <div className="relative bg-white rounded-2xl p-6 shadow-md border border-slate-100
                                  transition-all duration-300 group-hover:-translate-y-2
                                  group-hover:shadow-xl group-hover:border-blue-200">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{pub.emoji}</span>
                        <div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${pub.statusBg}`}>
                            {pub.status}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">{pub.conference}</p>
                        </div>
                      </div>
                      {pub.linkLabel && (
                        <span className="text-blue-500 text-sm font-semibold group-hover:underline whitespace-nowrap">
                          {pub.linkLabel} ↗
                        </span>
                      )}
                    </div>
                    <h4 className={`mt-4 font-poppins font-semibold text-base leading-snug transition-colors
                                    ${pub.link ? 'group-hover:text-blue-600' : 'text-black'}`}>
                      {pub.title}
                    </h4>
                    <ul className="mt-4 space-y-1">
                      {pub.highlights.map((h, i) => (
                        <li key={i} className="text-slate-500 text-sm flex gap-2">
                          <span className="text-blue-400 mt-0.5">▸</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardWrapper>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* ── Achievements ── */}
      <div className='py-16'>
        <motion.h3 className='subhead-text' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>Achievements.</motion.h3>
        <motion.p className='mt-5 text-slate-500' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>
          Competitive programming, innovation challenges, and global rankings.
        </motion.p>
        <motion.div className='mt-12 grid grid-cols-1 md:grid-cols-3 gap-8'
          initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
          {achievements.map((ach) => (
            <motion.div key={ach.title} variants={fadeUp}>
              <div className="block-container content-card w-full">
                <div className={`btn-back rounded-2xl ${ach.theme}`} />
                <div className="btn-front rounded-2xl p-6 flex flex-col gap-3">
                  <span className="text-4xl">{ach.emoji}</span>
                  <div>
                    <h4 className="font-poppins font-bold text-base text-black leading-snug">{ach.title}</h4>
                    <p className="mt-1 text-2xl font-poppins font-extrabold blue-gradient_text">{ach.rank}</p>
                    <p className="text-slate-500 text-xs mt-2 leading-relaxed">{ach.sub}</p>
                  </div>
                  <div className="flex gap-3 flex-wrap pt-1">
                    <a href={ach.linkedinLink} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold text-blue-500 hover:underline">
                      LinkedIn Post ↗
                    </a>
                    <a href={ach.certLink} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline">
                      Certificate ↗
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Competitive Programming ── */}
      <div className='py-16'>
        <motion.h3 className='subhead-text' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>Competitive Programming.</motion.h3>
        <motion.p className='mt-5 text-slate-500' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>
          Consistent competitor on CodeChef and Codeforces — strong in DSA, DP, and optimization.
        </motion.p>

        <motion.div className='mt-12 grid grid-cols-1 md:grid-cols-2 gap-8'
          initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
          {competitiveProgramming.map((cp) => (
            <motion.div key={cp.platform} variants={fadeUp}>
              <div className={`bg-white rounded-2xl border ${cp.border} shadow-md overflow-hidden
                               hover:-translate-y-2 hover:shadow-xl transition-all duration-300`}>
                {/* Gradient header */}
                <div className={`bg-gradient-to-r ${cp.color} p-5 flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{cp.emoji}</span>
                    <div>
                      <h4 className="text-white font-poppins font-bold text-xl">{cp.platform}</h4>
                      {cp.stars && (
                        <span className="text-white/90 text-sm font-semibold">{cp.stars} · {cp.rating}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-extrabold text-2xl">{cp.highlight}</p>
                    <p className="text-white/80 text-xs">{cp.highlightSub}</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                  {cp.stats.map((s) => (
                    <div key={s.label} className="p-3 text-center">
                      <p className="font-poppins font-bold text-lg text-black">{s.value}</p>
                      <p className="text-xs text-slate-400">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Description + links */}
                <div className="p-5">
                  <p className="text-slate-500 text-sm leading-relaxed">{cp.description}</p>
                  <div className="mt-4 flex gap-4 flex-wrap">
                    <a href={cp.profileLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-white
                                 bg-gradient-to-r from-[#00c6ff] to-[#0072ff] px-4 py-2 rounded-lg
                                 hover:opacity-90 hover:scale-105 transition-transform duration-150">
                      View Profile ↗
                    </a>
                    {cp.linkedinLink && (
                      <a href={cp.linkedinLink} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600
                                   border border-blue-300 px-4 py-2 rounded-lg hover:bg-blue-50
                                   hover:scale-105 transition-transform duration-150">
                        LinkedIn Post ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Skills ── */}
      <div className='py-10 flex flex-col'>
        <motion.h3 className='subhead-text' initial="hidden" whileInView="show"
          variants={fadeUp} viewport={{ once: true }}>My Skills</motion.h3>
        <motion.div className='mt-16 flex flex-wrap gap-12'
          initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
          {skills.map((skill) => (
            <motion.div key={skill.name} variants={fadeUp}
              className='block-container w-20 h-20' title={skill.name}>
              <div className='btn-back rounded-xl' />
              <div className='btn-front rounded-xl flex justify-center items-center'>
                <img src={skill.imageUrl} alt={skill.name} className='w-1/2 h-1/2 object-contain' />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <hr className='border-slate-200' />
      <CTA />
    </section>
  );
};

export default About;
