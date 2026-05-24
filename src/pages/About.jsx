import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";
import { motion } from "framer-motion";
import "react-vertical-timeline-component/style.min.css";

import { useState } from "react";
import { CTA } from "../components";
import { experiences, skills, publications, achievements, competitiveProgramming } from "../constants";
import AnimatedCard from '../components/explore/AnimatedCard';
import GitHubHeatmap from '../components/GitHubHeatmap';
import TypingTerminal from '../components/TypingTerminal';

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

const EXPERTISE_EFFECTS = { backend:'ice', frontend:'psychic', ai:'dragon', database:'fire', devops:'water', sysdesign:'electric' };

function ExpertiseCard({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div variants={fadeUp}>
      <AnimatedCard effect={EXPERTISE_EFFECTS[item.id] || 'default'}>
      <div className={`luxe-card overflow-hidden transition-all duration-300 ${open ? 'border-amber-500/40' : ''}`}>
        {/* Header — always visible, clickable */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full text-left"
        >
          <div className="p-5 flex items-center justify-between border-b border-white/[0.06]">
            <div>
              <h4 className="text-white font-poppins font-bold text-lg">{item.title}</h4>
              <p className="luxe-body-muted text-xs mt-0.5 max-w-md">{item.summary}</p>
            </div>
            <span className={`text-amber-300 text-xl transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
          </div>
        </button>

        {/* Tags — always visible */}
        <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-white/[0.06]">
          {item.tags.map(t => (
            <span
              key={t}
              className="border border-gray-800 bg-white/[0.03] text-gray-300 text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md"
            >
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
              <li key={i} className="flex gap-2 luxe-body-muted text-sm leading-relaxed">
                <span className="text-amber-400 mt-0.5 shrink-0">▸</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      </AnimatedCard>
    </motion.div>
  );
}

// ── Skill categorization derived from existing constants/skills ──
const skillByName = (name) => skills.find(s => s.name === name);
const LANGUAGES_NAMES   = ['JavaScript', 'TypeScript', 'Python', 'C++', 'CSS'];
const FRAMEWORKS_NAMES  = ['React.js', 'Next.js', 'Node.js', 'Express.js', 'PyTorch', 'Tailwind CSS', 'Material UI', 'LangChain'];
const TOOLS_NAMES       = ['MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Docker', 'Git', 'GitHub', 'RabbitMQ', 'OpenAI API'];

const SKILL_GROUPS = [
  { key: 'languages',  label: 'Languages',  items: LANGUAGES_NAMES.map(skillByName).filter(Boolean) },
  { key: 'frameworks', label: 'Frameworks', items: FRAMEWORKS_NAMES.map(skillByName).filter(Boolean) },
  { key: 'tools',      label: 'Tools',      items: TOOLS_NAMES.map(skillByName).filter(Boolean) },
];

function SkillGroupCard({ group }) {
  return (
    <motion.div variants={fadeUp} className="luxe-card luxe-card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="luxe-eyebrow text-amber-300/80">{group.key}</p>
          <h4 className="text-white font-semibold text-base mt-1">{group.label}</h4>
        </div>
        {/* tiny dark preview thumb — icon stack hint */}
        <div className="flex -space-x-2 shrink-0">
          {group.items.slice(0, 3).map((s) => (
            <div
              key={s.name}
              title={s.name}
              className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center"
            >
              <img src={s.imageUrl} alt={s.name} className="w-4 h-4 object-contain opacity-90" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {group.items.map((s) => (
          <span
            key={s.name}
            className="border border-gray-800 bg-white/[0.03] text-gray-300 text-xs px-2 py-1 rounded-md"
          >
            {s.name}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

const About = () => {
  return (
    <section className="relative min-h-screen bg-surface-base text-fg-primary pt-28 pb-24 px-4 sm:px-6 overflow-hidden">
      {/* ── Ambient hero orbs — primary anchor behind the headline + cool secondary off-right ── */}
      <div aria-hidden className="ambient-orb absolute -top-32 left-1/2 -translate-x-1/2" />
      <div aria-hidden className="ambient-orb ambient-orb-cool absolute top-[40%] -right-40 opacity-70" />

      <div className="relative max-w-5xl mx-auto">

        {/* ── Flagship hero — recruiter dwell-time peaks here, so this is the keep-them-scrolling moment. ── */}
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <p className="eyebrow-mono">— About</p>
          <h1 className="gradient-text-amber luxe-section-title text-4xl sm:text-5xl md:text-6xl mt-3 leading-[1.05]">
            Engineer · creator · builder
          </h1>

          {/* Status pill — gives recruiters an at-a-glance signal. */}
          <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                          bg-surface-elevated/60 backdrop-blur-sm border border-line">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald" />
            </span>
            <span className="text-xs font-medium text-fg-secondary">Open to senior engineering roles · Mumbai / Remote</span>
          </div>

          <p className="mt-5 max-w-2xl leading-relaxed text-fg-secondary text-base">
            Founding Engineer & ML Researcher based in Mumbai, India. I build scalable
            full-stack products and AI-driven systems — from 100+ REST APIs at{" "}
            <a href="https://www.linkedin.com/company/getpassionfruit/posts/?feedView=all"
               target="_blank" rel="noreferrer"
               className="text-accent-amber hover:text-amber-200 underline-offset-4 hover:underline font-medium">
              Passionfruit (NY)
            </a>{" "}
            to graph neural networks for blockchain phishing detection at{" "}
            <a href="https://www.iitp.ac.in" target="_blank" rel="noreferrer"
               className="text-accent-amber hover:text-amber-200 underline-offset-4 hover:underline font-medium">
              IIT Patna
            </a>.{" "}
            B.Tech CE from DJS College (CGPA 9.1), 3 research publications, Meta Hacker Cup 2025{" "}
            <a href="https://www.linkedin.com/posts/siddharth-fulia_metahackercup2025-top200-round3-activity-7432281275920728066-5b8P?utm_source=share&utm_medium=member_desktop&rcm=ACoAADbS-ywBYuwbaIFL7brrtMs_7hHq9KiB_bw"
               target="_blank" rel="noreferrer"
               className="text-accent-amber hover:text-amber-200 underline-offset-4 hover:underline font-medium">
              Global Rank 186
            </a>, and CodeChef 5★ (2114 rating).
          </p>

          {/* ── Stat strip — recruiter-readable proof points at a glance. ── */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { value: '100+',  label: 'REST APIs shipped',  accent: 'text-accent-amber' },
              { value: '3',     label: 'Publications',       accent: 'text-accent-rose' },
              { value: '186',   label: 'Hacker Cup global',  accent: 'text-accent-fuchsia' },
              { value: '5★',    label: 'CodeChef · 2114',    accent: 'text-accent-cyan' },
            ].map((s) => (
              <div key={s.label}
                   className="luxe-card p-5 sm:p-6 flex flex-col gap-1 transition-transform hover:-translate-y-0.5">
                <p className={`font-poppins font-extrabold text-2xl sm:text-3xl tabular-nums ${s.accent}`}>{s.value}</p>
                <p className="text-fg-muted text-xs uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/resume.pdf" target="_blank" rel="noreferrer"
               className="luxe-btn luxe-btn-primary tap-44">
              View / Download Resume
            </a>
            <a href="https://www.linkedin.com/in/siddharth-fulia/" target="_blank" rel="noreferrer"
               className="luxe-btn luxe-btn-secondary tap-44">
              LinkedIn Profile
            </a>
            <a href="mailto:siddharthfulia7@gmail.com"
               className="luxe-btn luxe-btn-secondary tap-44">
              Email Me
            </a>
          </div>
        </motion.div>

        {/* ── Terminal ── */}
        <motion.div
          className="mt-12 luxe-card overflow-hidden"
          initial="hidden" whileInView="show" variants={fadeUp} viewport={{ once: true }}
        >
          <TypingTerminal />
        </motion.div>

        {/* ── GitHub contributions ── */}
        <motion.div
          className="mt-10 luxe-card p-5 sm:p-6"
          initial="hidden" whileInView="show" variants={fadeUp} viewport={{ once: true }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-fg-primary font-semibold text-base">GitHub contributions</h3>
            <span className="text-fg-muted text-xs">@Sid-passion</span>
          </div>
          <GitHubHeatmap username="Sid-passion" />
        </motion.div>

        {/* ── Skills & Experience (2-column layout) ── */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-8">

          {/* LEFT: Skills */}
          <motion.div
            initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}
          >
            <p className="eyebrow-mono">— Skills</p>
            <h2 className="luxe-section-title text-2xl text-fg-primary mt-2">Tech stack</h2>
            <p className="text-fg-secondary leading-relaxed mt-2 max-w-2xl">
              Languages, frameworks, and tools I reach for to ship production systems.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              {SKILL_GROUPS.map((g) => (
                <SkillGroupCard key={g.key} group={g} />
              ))}
            </div>
          </motion.div>

          {/* RIGHT: Experience */}
          <motion.div
            initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}
          >
            <p className="eyebrow-mono">— Experience</p>
            <h2 className="luxe-section-title text-2xl text-fg-primary mt-2">Where I've shipped</h2>
            <p className="text-fg-secondary leading-relaxed mt-2 max-w-2xl">
              Cutting-edge companies and research labs where I've shipped real impact.
            </p>

            {/* Timeline rail */}
            <div className="relative mt-6 pl-5">
              <div
                aria-hidden
                className="absolute left-[6px] top-1 bottom-1 w-px"
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom, rgba(251,191,36,0.45) 0, rgba(251,191,36,0.45) 4px, transparent 4px, transparent 8px)',
                  backgroundSize: '1px 8px',
                  backgroundRepeat: 'repeat-y',
                }}
              />

              <div className="flex flex-col gap-4">
                {experiences.map((exp) => (
                  <motion.div key={exp.company_name} variants={fadeUp} className="relative">
                    {/* node */}
                    <span
                      aria-hidden
                      className="absolute -left-5 top-5 w-3 h-3 rounded-full bg-[#0a0a0e] border-2"
                      style={{ borderColor: '#fbbf24' }}
                    />
                    <div className="luxe-card luxe-card-hover p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <a
                          href={exp.company_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-fg-primary font-semibold hover:text-accent-amber transition-colors"
                        >
                          {exp.company_name} ↗
                        </a>
                        <span className="text-fg-muted text-xs">{exp.date}</span>
                      </div>
                      <p className="text-accent-rose text-sm font-medium mt-1">{exp.title}</p>
                      <ul className="mt-3 space-y-2">
                        {exp.points.map((point, i) => (
                          <li key={i} className="flex gap-2 text-fg-secondary text-sm leading-relaxed">
                            <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-accent-amber/70" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Tech Expertise ── */}
        <div className="mt-20">
          <motion.p className="eyebrow-mono" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>— What I build</motion.p>
          <motion.h2 className="luxe-section-title text-3xl text-fg-primary mt-2" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>Systems I've designed and shipped</motion.h2>
          <motion.p className="mt-3 max-w-2xl leading-relaxed text-fg-secondary" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>
            Real-world systems across the stack — click each to see details.
          </motion.p>
          <motion.div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6"
            initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
            {EXPERTISE.map(item => (
              <ExpertiseCard key={item.id} item={item} />
            ))}
          </motion.div>
        </div>

        {/* ── Research & Publications ── */}
        <div className="mt-20">
          <motion.p className="eyebrow-mono" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>— Research</motion.p>
          <motion.h2 className="luxe-section-title text-3xl text-fg-primary mt-2" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>Publications</motion.h2>
          <motion.p className="mt-3 max-w-2xl leading-relaxed text-fg-secondary" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>
            3 papers published / accepted in international journals and conferences.
          </motion.p>
          <motion.div className="mt-10 flex flex-col gap-5"
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
                    <div className="luxe-card luxe-card-hover p-6">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md
                                           bg-amber-500/10 border border-amber-500/30 text-amber-200">
                            {pub.status}
                          </span>
                          <p className="luxe-body-muted text-xs mt-1">{pub.conference}</p>
                        </div>
                        {pub.linkLabel && (
                          <span className="text-amber-300 text-sm font-semibold group-hover:underline whitespace-nowrap">
                            {pub.linkLabel} ↗
                          </span>
                        )}
                      </div>
                      <h4 className={`mt-4 font-poppins font-semibold text-base leading-snug
                                      ${pub.link ? 'text-white group-hover:text-amber-200' : 'text-white'}`}>
                        {pub.title}
                      </h4>
                      <ul className="mt-4 space-y-1.5">
                        {pub.highlights.map((h, i) => (
                          <li key={i} className="luxe-body-muted text-sm flex gap-2">
                            <span className="text-amber-400 mt-0.5">▸</span>
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
        <div className="mt-20">
          <motion.p className="eyebrow-mono" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>— Achievements</motion.p>
          <motion.h2 className="luxe-section-title text-3xl text-fg-primary mt-2" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>Competitive wins</motion.h2>
          <motion.p className="mt-3 max-w-2xl leading-relaxed text-fg-secondary" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>
            Competitive programming, innovation challenges, and global rankings.
          </motion.p>
          <motion.div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6"
            initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
            {achievements.map((ach) => (
              <motion.div key={ach.title} variants={fadeUp}>
                <div className="luxe-card luxe-card-hover p-6 h-full flex flex-col gap-3">
                  <div>
                    <h4 className="font-poppins font-semibold text-base text-white leading-snug">{ach.title}</h4>
                    <p className="mt-1 text-2xl font-poppins font-extrabold text-amber-300">{ach.rank}</p>
                    <p className="luxe-body-muted text-xs mt-2 leading-relaxed">{ach.sub}</p>
                  </div>
                  <div className="flex gap-3 flex-wrap pt-1 mt-auto">
                    <a href={ach.linkedinLink} target="_blank" rel="noreferrer"
                       className="text-xs font-semibold text-amber-300 hover:text-amber-200 hover:underline">
                      LinkedIn Post ↗
                    </a>
                    <a href={ach.certLink} target="_blank" rel="noreferrer"
                       className="text-xs font-semibold text-gray-400 hover:text-gray-200 hover:underline">
                      Certificate ↗
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* ── Competitive Programming ── */}
        <div className="mt-20">
          <motion.p className="eyebrow-mono" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>— Competitive programming</motion.p>
          <motion.h2 className="luxe-section-title text-3xl text-fg-primary mt-2" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>CodeChef · Codeforces</motion.h2>
          <motion.p className="mt-3 max-w-2xl leading-relaxed text-fg-secondary" initial="hidden" whileInView="show"
            variants={fadeUp} viewport={{ once: true }}>
            Consistent competitor — strong in DSA, DP, and optimization.
          </motion.p>

          <motion.div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6"
            initial="hidden" whileInView="show" variants={stagger} viewport={{ once: true }}>
            {competitiveProgramming.map((cp) => (
              <motion.div key={cp.platform} variants={fadeUp}>
                <div className="luxe-card luxe-card-hover overflow-hidden">
                  {/* Header */}
                  <div className="p-5 flex items-center justify-between border-b border-white/[0.06]">
                    <div>
                      <h4 className="text-white font-poppins font-bold text-xl">{cp.platform}</h4>
                      {cp.stars && (
                        <span className="text-amber-300 text-sm font-semibold">{cp.stars} · {cp.rating}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-white font-extrabold text-xl">{cp.highlight}</p>
                      <p className="luxe-body-muted text-xs">{cp.highlightSub}</p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
                    {cp.stats.map((s) => (
                      <div key={s.label} className="p-3 text-center">
                        <p className="font-poppins font-bold text-lg text-white">{s.value}</p>
                        <p className="luxe-body-muted text-[11px]">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Description + links */}
                  <div className="p-5">
                    <p className="luxe-body-muted text-sm leading-relaxed">{cp.description}</p>
                    <div className="mt-4 flex gap-3 flex-wrap">
                      <a href={cp.profileLink} target="_blank" rel="noreferrer"
                         className="luxe-btn luxe-btn-primary">
                        View Profile ↗
                      </a>
                      {cp.linkedinLink && (
                        <a href={cp.linkedinLink} target="_blank" rel="noreferrer"
                           className="luxe-btn luxe-btn-secondary">
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

        <div className="luxe-divider mt-20" />
        <div className="mt-12">
          <CTA />
        </div>
      </div>
    </section>
  );
};

export default About;
