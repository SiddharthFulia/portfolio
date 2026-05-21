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

            {/* Direct contacts — labeled rows so the actual handles +
                email are visible at a glance, not buried behind icons. */}
            <div className='luxe-card p-5'>
              <p className='text-[11px] uppercase tracking-wider text-gray-500 mb-4'>
                Or find me here
              </p>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                <a href='mailto:siddharthfulia7@gmail.com'
                  className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                  <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-violet-300 transition-colors'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                      <rect x='2' y='4' width='20' height='16' rx='2' /><path d='m22 7-10 5L2 7' />
                    </svg>
                  </span>
                  <span className='flex flex-col min-w-0'>
                    <span className='text-[10px] uppercase tracking-wider text-gray-500'>Email</span>
                    <span className='text-sm text-gray-200 group-hover:text-white transition-colors truncate'>
                      siddharthfulia7@gmail.com
                    </span>
                  </span>
                </a>

                <a href='https://wa.me/918877663311?text=Hi%20Siddharth!%20I%20found%20your%20portfolio%20and%20would%20love%20to%20connect.'
                  target='_blank' rel='noreferrer'
                  className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                  <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-emerald-300 transition-colors'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>
                      <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.768.967-.941 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z' />
                    </svg>
                  </span>
                  <span className='flex flex-col min-w-0'>
                    <span className='text-[10px] uppercase tracking-wider text-gray-500'>WhatsApp</span>
                    <span className='text-sm text-gray-200 group-hover:text-white transition-colors truncate'>
                      +91 88776 63311
                    </span>
                  </span>
                </a>

                <a href='tel:+918877663311'
                  className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                  <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-amber-300 transition-colors'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                      <path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' />
                    </svg>
                  </span>
                  <span className='flex flex-col min-w-0'>
                    <span className='text-[10px] uppercase tracking-wider text-gray-500'>Phone</span>
                    <span className='text-sm text-gray-200 group-hover:text-white transition-colors truncate'>
                      +91 88776 63311
                    </span>
                  </span>
                </a>

                <a href='https://github.com/SiddharthFulia'
                  target='_blank' rel='noreferrer'
                  className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                  <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-white transition-colors'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>
                      <path d='M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.73 18.77.5 12 .5z' />
                    </svg>
                  </span>
                  <span className='flex flex-col min-w-0'>
                    <span className='text-[10px] uppercase tracking-wider text-gray-500'>GitHub</span>
                    <span className='text-sm text-gray-200 group-hover:text-white transition-colors truncate'>
                      @SiddharthFulia
                    </span>
                  </span>
                </a>

                <a href='https://www.linkedin.com/in/siddharth-fulia/'
                  target='_blank' rel='noreferrer'
                  className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                  <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-blue-300 transition-colors'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>
                      <path d='M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.26 2.37 4.26 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z' />
                    </svg>
                  </span>
                  <span className='flex flex-col min-w-0'>
                    <span className='text-[10px] uppercase tracking-wider text-gray-500'>LinkedIn</span>
                    <span className='text-sm text-gray-200 group-hover:text-white transition-colors truncate'>
                      siddharth-fulia
                    </span>
                  </span>
                </a>

                <a href='https://github.com/Sid-passion'
                  target='_blank' rel='noreferrer'
                  className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                  <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-violet-300 transition-colors'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                      <rect x='3' y='4' width='18' height='16' rx='2' /><path d='M9 9h6M9 13h6M9 17h4' />
                    </svg>
                  </span>
                  <span className='flex flex-col min-w-0'>
                    <span className='text-[10px] uppercase tracking-wider text-gray-500'>Work · Private</span>
                    <span className='text-sm text-gray-200 group-hover:text-white transition-colors truncate'>
                      @Sid-passion
                    </span>
                  </span>
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
