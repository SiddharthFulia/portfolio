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
              {project.link && (
                <div className='mt-5 flex items-center gap-2 font-poppins'>
                  <Link to={project.link} target='_blank' rel='noopener noreferrer'
                    className='font-semibold text-blue-600 hover:underline'>
                    {project.linkLabel}
                  </Link>
                  <img src={arrow} alt='arrow' className='w-4 h-4 object-contain' />
                </div>
              )}
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
