import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";
import { motion } from "framer-motion";
import "react-vertical-timeline-component/style.min.css";

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
