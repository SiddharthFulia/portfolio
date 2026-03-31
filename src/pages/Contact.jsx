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
    <section className='relative flex lg:flex-row flex-col max-container'>
      {alert.show && <Alert {...alert} />}

      <div className='flex-1 min-w-[50%] flex flex-col'>
        <h1 className='head-text'>Get in Touch</h1>

        {/* Direct contact info */}
        <div className='mt-6 flex flex-col gap-3'>
          <a href='mailto:siddharthfulia7@gmail.com'
            className='flex items-center gap-3 group w-fit'>
            <span className='text-2xl'>📧</span>
            <span className='text-slate-600 font-medium group-hover:text-blue-500 transition-colors'>
              siddharthfulia7@gmail.com
            </span>
          </a>
          <a href='https://www.linkedin.com/in/siddharth-fulia/' target='_blank' rel='noreferrer'
            className='flex items-center gap-3 group w-fit'>
            <span className='text-2xl'>💼</span>
            <span className='text-slate-600 font-medium group-hover:text-blue-500 transition-colors'>
              linkedin.com/in/siddharth-fulia
            </span>
          </a>
          <a href='https://github.com/SiddharthFulia' target='_blank' rel='noreferrer'
            className='flex items-center gap-3 group w-fit'>
            <span className='text-2xl'>🐙</span>
            <span className='text-slate-600 font-medium group-hover:text-blue-500 transition-colors'>
              github.com/SiddharthFulia
            </span>
          </a>
        </div>

        <div className='mt-8 mb-2 flex items-center gap-3'>
          <div className='flex-1 h-px bg-slate-200' />
          <span className='text-slate-400 text-sm'>or send a message below</span>
          <div className='flex-1 h-px bg-slate-200' />
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className='w-full flex flex-col gap-7 mt-14'
        >
          <label className='text-black-500 font-semibold'>
            Name
            <input
              type='text'
              name='name'
              className='input'
              placeholder='Your name'
              required
              value={form.name}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </label>
          <label className='text-black-500 font-semibold'>
            Email
            <input
              type='email'
              name='email'
              className='input'
              placeholder='your@email.com'
              required
              value={form.email}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </label>
          <label className='text-black-500 font-semibold'>
            Your Message
            <textarea
              name='message'
              rows='4'
              className='textarea'
              placeholder='Write your thoughts here...'
              value={form.message}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </label>

          <button
            type='submit'
            disabled={loading}
            className='btn'
            onFocus={handleFocus}
            onBlur={handleBlur}
          >
            {loading ? "Sending..." : "Send Message"}
          </button>
        </form>
      </div>

      <div className='lg:w-1/2 w-full lg:h-auto md:h-[550px] h-[350px]'>
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
    </section>
  );
};

export default Contact;
