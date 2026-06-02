import emailjs from "@emailjs/browser";
import { Canvas } from "@react-three/fiber";
import { Suspense, useState } from "react";
import { Form, Input, Button, ConfigProvider, theme as antdTheme } from "antd";

import { Fox } from "../models";
import { Loader } from "../components";

const { useForm } = Form;

const Contact = () => {
  const [form] = useForm();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentAnimation, setCurrentAnimation] = useState("idle");

  const handleFocus = () => setCurrentAnimation("walk");
  const handleBlur  = () => setCurrentAnimation("idle");

  const handleSubmit = async (values) => {
    setLoading(true);
    setErrorMsg("");
    setCurrentAnimation("hit");

    try {
      await emailjs.send(
        import.meta.env.VITE_APP_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_APP_EMAILJS_TEMPLATE_ID,
        {
          from_name: values.name,
          from_email: values.email,
          to_name: "Siddharth",
          to_email: "siddharthfulia7@gmail.com",
          message: values.message,
          time: new Date().toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }),
        },
        import.meta.env.VITE_APP_EMAILJS_PUBLIC_KEY
      );
      setSubmitted(true);
      setCurrentAnimation("idle");
      form.resetFields();
    } catch (err) {
      console.error(err);
      setErrorMsg("Message failed to send. Please email directly or try again.");
      setCurrentAnimation("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setErrorMsg("");
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: '#fbbf24',
          colorBgContainer: 'rgba(255,255,255,0.03)',
          colorBorder: '#1f2937',
          colorText: '#f1f5f9',
          colorTextPlaceholder: '#64748b',
          borderRadius: 10,
          fontFamily: "'Work Sans', sans-serif",
        },
      }}
    >
      <section className='relative min-h-screen bg-surface-base text-fg-primary pt-28 sm:pt-32 pb-24 px-4 sm:px-6 overflow-hidden'>
        {/* Ambient orbs — primary anchor + cool secondary off-right */}
        <div aria-hidden className='ambient-orb absolute -top-24 left-1/4 -translate-x-1/2' />
        <div aria-hidden className='ambient-orb ambient-orb-cool absolute top-1/2 -right-40 opacity-70' />

        <div className='relative max-w-6xl mx-auto'>
          {/* Section header */}
          <div className='mb-10 sm:mb-14'>
            <p className='eyebrow-mono'>— Contact</p>
            <h1 className='gradient-text-amber luxe-section-title text-4xl sm:text-5xl mt-3 leading-[1.05]'>
              Get in touch
            </h1>
            <p className='mt-4 max-w-2xl leading-relaxed text-fg-secondary'>
              Let's build something great together. Drop a note and I'll get back within 24 hours
              — or reach me directly on any of the channels below.
            </p>
          </div>

          {/* Two-column layout */}
          <div className='grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14 items-start'>
            {/* Form column */}
            {/* flex-col-reverse — render the find-me-here block FIRST, form second */}
            <div className='lg:col-span-3 flex flex-col-reverse gap-6'>
              {submitted ? (
                /* ── Success state — replaces the form entirely so the
                       user gets clear positive feedback, no toast guesswork. ── */
                <div className='luxe-card p-6 sm:p-8 flex flex-col items-center text-center'>
                  <div className='w-16 h-16 rounded-full bg-accent-emerald/15 border border-accent-emerald/40
                                  flex items-center justify-center mb-4'>
                    <svg width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#34d399'
                         strokeWidth='3' strokeLinecap='round' strokeLinejoin='round'>
                      <polyline points='20 6 9 17 4 12' />
                    </svg>
                  </div>
                  <h2 className='gradient-text-amber font-poppins font-bold text-2xl sm:text-3xl leading-tight'>
                    Message sent!
                  </h2>
                  <p className='mt-3 max-w-md leading-relaxed text-fg-secondary'>
                    Thanks for reaching out — I'll get back to you within 24 hours.
                    In the meantime, feel free to connect on any of the channels below.
                  </p>
                  <button
                    onClick={handleReset}
                    className='luxe-btn luxe-btn-secondary tap-44 mt-6'
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <div className='luxe-card p-5 sm:p-8'>
                  <Form
                    form={form}
                    layout='vertical'
                    onFinish={handleSubmit}
                    requiredMark={false}
                    autoComplete='off'
                    onFieldsChange={() => { if (errorMsg) setErrorMsg(""); }}
                  >
                    <Form.Item
                      label={<span className='eyebrow-mono !text-fg-muted'>Name</span>}
                      name='name'
                      rules={[
                        { required: true, message: 'Please tell me your name' },
                        { min: 2, message: 'Name must be at least 2 characters' },
                      ]}
                    >
                      <Input
                        size='large'
                        placeholder='Your name'
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                      />
                    </Form.Item>

                    <Form.Item
                      label={<span className='eyebrow-mono !text-fg-muted'>Email</span>}
                      name='email'
                      rules={[
                        { required: true, message: 'I need an email to reply to' },
                        { type: 'email', message: 'That doesn\'t look like a valid email' },
                      ]}
                    >
                      <Input
                        size='large'
                        placeholder='your@email.com'
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                      />
                    </Form.Item>

                    <Form.Item
                      label={<span className='eyebrow-mono !text-fg-muted'>Message</span>}
                      name='message'
                      rules={[
                        { required: true, message: 'Please write a short message' },
                        { min: 10, message: 'At least 10 characters so I have context' },
                      ]}
                    >
                      <Input.TextArea
                        rows={5}
                        placeholder='What are you working on? What would you like to build together?'
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        showCount
                        maxLength={1000}
                      />
                    </Form.Item>

                    {errorMsg && (
                      <div className='mb-4 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30
                                      text-rose-200 text-sm flex items-start gap-2'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor'
                             strokeWidth='2' strokeLinecap='round' className='mt-0.5 shrink-0'>
                          <circle cx='12' cy='12' r='10' /><line x1='12' y1='8' x2='12' y2='12' />
                          <line x1='12' y1='16' x2='12.01' y2='16' />
                        </svg>
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <Form.Item className='!mb-0'>
                      <Button
                        htmlType='submit'
                        type='primary'
                        size='large'
                        loading={loading}
                        block
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        style={{
                          background: '#fbbf24',
                          border: 'none',
                          color: '#0a0a0e',
                          fontWeight: 600,
                          height: 48,
                        }}
                      >
                        {loading ? 'Sending…' : 'Send Message'}
                      </Button>
                    </Form.Item>
                  </Form>
                </div>
              )}

              {/* Direct contacts — labeled rows so the actual handles +
                  email are visible at a glance, not buried behind icons. */}
              <div className='luxe-card p-5 sm:p-6'>
                <p className='eyebrow-mono mb-4'>— Find me here</p>
                {/* auto-rows-[64px] forces every row to the same height so
                    icons line up across both columns even when the text
                    length differs between left + right cards. */}
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-[64px]'>
                  <a href='mailto:siddharthfulia7@gmail.com'
                    className='tap-44 h-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                    <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-fg-secondary group-hover:text-accent-amber transition-colors'>
                      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='2' y='4' width='20' height='16' rx='2' /><path d='m22 7-10 5L2 7' />
                      </svg>
                    </span>
                    <span className='flex flex-col min-w-0'>
                      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>Email</span>
                      <span className='text-sm text-fg-secondary group-hover:text-fg-primary transition-colors truncate'>
                        siddharthfulia7@gmail.com
                      </span>
                    </span>
                  </a>

                  <a href='https://wa.me/918877663311?text=Hi%20Siddharth!%20I%20found%20your%20portfolio%20and%20would%20love%20to%20connect.'
                    target='_blank' rel='noreferrer'
                    className='tap-44 h-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                    <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-fg-secondary group-hover:text-accent-emerald transition-colors'>
                      <svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>
                        <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.768.967-.941 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z' />
                      </svg>
                    </span>
                    <span className='flex flex-col min-w-0'>
                      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>WhatsApp</span>
                      <span className='text-sm text-fg-secondary group-hover:text-fg-primary transition-colors truncate'>
                        +91 88776 63311
                      </span>
                    </span>
                  </a>

                  <a href='tel:+918877663311'
                    className='tap-44 h-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                    <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-fg-secondary group-hover:text-accent-amber transition-colors'>
                      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' />
                      </svg>
                    </span>
                    <span className='flex flex-col min-w-0'>
                      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>Phone</span>
                      <span className='text-sm text-fg-secondary group-hover:text-fg-primary transition-colors truncate'>
                        +91 88776 63311
                      </span>
                    </span>
                  </a>

                  <a href='https://github.com/SiddharthFulia'
                    target='_blank' rel='noreferrer'
                    className='tap-44 h-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                    <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-fg-secondary group-hover:text-fg-primary transition-colors'>
                      <svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>
                        <path d='M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.73 18.77.5 12 .5z' />
                      </svg>
                    </span>
                    <span className='flex flex-col min-w-0'>
                      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>GitHub</span>
                      <span className='text-sm text-fg-secondary group-hover:text-fg-primary transition-colors truncate'>
                        @SiddharthFulia
                      </span>
                    </span>
                  </a>

                  <a href='https://www.linkedin.com/in/siddharth-fulia/'
                    target='_blank' rel='noreferrer'
                    className='tap-44 h-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                    <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-fg-secondary group-hover:text-accent-cyan transition-colors'>
                      <svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>
                        <path d='M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.26 2.37 4.26 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z' />
                      </svg>
                    </span>
                    <span className='flex flex-col min-w-0'>
                      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>LinkedIn</span>
                      <span className='text-sm text-fg-secondary group-hover:text-fg-primary transition-colors truncate'>
                        siddharth-fulia
                      </span>
                    </span>
                  </a>

                  <a href='https://github.com/Sid-passion'
                    target='_blank' rel='noreferrer'
                    className='tap-44 h-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group'>
                    <span className='w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-fg-secondary group-hover:text-accent-amber transition-colors'>
                      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='3' y='4' width='18' height='16' rx='2' /><path d='M9 9h6M9 13h6M9 17h4' />
                      </svg>
                    </span>
                    <span className='flex flex-col min-w-0'>
                      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>Work · Private</span>
                      <span className='text-sm text-fg-secondary group-hover:text-fg-primary transition-colors truncate'>
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
    </ConfigProvider>
  );
};

export default Contact;
