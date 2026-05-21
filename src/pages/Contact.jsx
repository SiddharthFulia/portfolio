import emailjs from "@emailjs/browser";
import { Canvas } from "@react-three/fiber";
import { Suspense, useRef, useState } from "react";

import { Fox } from "../models";
import useAlert from "../hooks/useAlert";
import { Alert, Loader } from "../components";

const Contact = () => {
  const formRef = useRef();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const { alert, showAlert, hideAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState("idle");

  const handleChange = ({ target: { name, value } }) => {
    setForm({ ...form, [name]: value });
  };

  const handleFocus = () => setCurrentAnimation("walk");
  const handleBlur = () => setCurrentAnimation("idle");

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setCurrentAnimation("hit");

    emailjs
      .send(
        import.meta.env.VITE_APP_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_APP_EMAILJS_TEMPLATE_ID,
        {
          from_name: form.name,
          from_email: form.email,
          to_name: "Siddharth",
          to_email: "siddharthfulia7@gmail.com",
          message: form.message,
          time: new Date().toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }),
        },
        import.meta.env.VITE_APP_EMAILJS_PUBLIC_KEY
      )
      .then(
        () => {
          setLoading(false);
          showAlert({
            show: true,
            text: "Thanks! I'll get back to you soon 😃",
            type: "success",
          });
          setTimeout(() => {
            hideAlert(false);
            setCurrentAnimation("idle");
            setForm({ name: "", email: "", message: "" });
          }, 3000);
        },
        (error) => {
          setLoading(false);
          console.error(error);
          setCurrentAnimation("idle");
          showAlert({
            show: true,
            text: "Message failed to send 😢 Try emailing directly.",
            type: "danger",
          });
        }
      );
  };

  return (
    <section className='min-h-screen bg-[#0a0a0e] text-gray-100 pt-28 pb-24 px-4 sm:px-6'>
      {alert.show && <Alert {...alert} />}

      <div className='max-w-6xl mx-auto'>
        {/* Section header */}
        <div className='mb-10 sm:mb-14'>
          <p className='luxe-eyebrow text-violet-300/80'>— Contact</p>
          <h1 className='luxe-section-title text-4xl sm:text-5xl text-white mt-3'>
            Get in touch
          </h1>
          <p className='luxe-body-muted mt-3 max-w-md'>
            Let's build something great together. Drop a note and I'll get back within 24 hours.
          </p>
        </div>

        {/* Two-column layout */}
        <div className='grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14 items-start'>
          {/* Form column */}
          <div className='lg:col-span-3 space-y-6'>
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className='luxe-card p-6 sm:p-8 space-y-4'
            >
              <div>
                <label
                  htmlFor='name'
                  className='text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 block'
                >
                  Name
                </label>
                <input
                  id='name'
                  type='text'
                  name='name'
                  className='luxe-input'
                  placeholder='Your name'
                  required
                  value={form.name}
                  onChange={handleChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>

              <div>
                <label
                  htmlFor='email'
                  className='text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 block'
                >
                  Email
                </label>
                <input
                  id='email'
                  type='email'
                  name='email'
                  className='luxe-input'
                  placeholder='your@email.com'
                  required
                  value={form.email}
                  onChange={handleChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>

              <div>
                <label
                  htmlFor='message'
                  className='text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 block'
                >
                  Message
                </label>
                <textarea
                  id='message'
                  name='message'
                  rows='5'
                  className='luxe-textarea'
                  placeholder='Write your thoughts here...'
                  required
                  value={form.message}
                  onChange={handleChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>

              <div className='pt-2'>
                <button
                  type='submit'
                  disabled={loading}
                  className='luxe-btn luxe-btn-primary w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed'
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                >
                  {loading ? "Sending…" : "Send Message"}
                </button>
              </div>
            </form>

            {/* Social icons row */}
            <div className='luxe-card p-4 sm:p-5'>
              <p className='text-[11px] uppercase tracking-wider text-gray-500 mb-3 text-center sm:text-left'>
                Or find me here
              </p>
              <div className='flex items-center justify-center sm:justify-start gap-3'>
                <a
                  href='https://github.com/SiddharthFulia'
                  target='_blank'
                  rel='noreferrer'
                  aria-label='GitHub'
                  title='GitHub'
                  className='w-9 h-9 rounded-full luxe-btn luxe-btn-ghost p-0'
                >
                  <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                    <path d='M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.73 18.77.5 12 .5z' />
                  </svg>
                </a>
                <a
                  href='https://www.linkedin.com/in/siddharth-fulia/'
                  target='_blank'
                  rel='noreferrer'
                  aria-label='LinkedIn'
                  title='LinkedIn'
                  className='w-9 h-9 rounded-full luxe-btn luxe-btn-ghost p-0'
                >
                  <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                    <path d='M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.26 2.37 4.26 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z' />
                  </svg>
                </a>
                <a
                  href='https://x.com/SiddharthFulia'
                  target='_blank'
                  rel='noreferrer'
                  aria-label='X (Twitter)'
                  title='X (Twitter)'
                  className='w-9 h-9 rounded-full luxe-btn luxe-btn-ghost p-0'
                >
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                    <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
                  </svg>
                </a>
                <a
                  href='mailto:siddharthfulia7@gmail.com'
                  aria-label='Email'
                  title='Email'
                  className='w-9 h-9 rounded-full luxe-btn luxe-btn-ghost p-0'
                >
                  <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                    <rect x='2' y='4' width='20' height='16' rx='2' />
                    <path d='m22 7-10 5L2 7' />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* 3D Fox column — hidden on mobile */}
          <div className='hidden lg:block lg:col-span-2 lg:h-[560px]'>
            <Canvas
              camera={{
                position: [0, 0, 5],
                fov: 75,
                near: 0.1,
                far: 1000,
              }}
            >
              <directionalLight position={[0, 0, 1]} intensity={2.5} />
              <ambientLight intensity={1} />
              <pointLight position={[5, 10, 0]} intensity={2} />
              <spotLight
                position={[10, 10, 10]}
                angle={0.15}
                penumbra={1}
                intensity={2}
              />

              <Suspense fallback={<Loader />}>
                <Fox
                  currentAnimation={currentAnimation}
                  position={[0.5, 0.35, 0]}
                  rotation={[12.629, -0.6, 0]}
                  scale={[0.5, 0.5, 0.5]}
                />
              </Suspense>
            </Canvas>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
