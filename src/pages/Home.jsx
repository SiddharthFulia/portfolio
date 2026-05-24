import { Canvas } from "@react-three/fiber";
import { Suspense, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { HomeInfo, Loader } from "../components";
import { Bird, Island, Plane, Sky } from "../models";

const STAGE_ROUTES = { 2: '/about', 3: '/projects', 4: '/contact' };
const AUTO_NAV_DELAY = 3000; // 3 seconds — tighter pace through the island stages

const Home = () => {
  const [currentStage, setCurrentStage] = useState(1);
  const [isRotating, setIsRotating] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [navProgress, setNavProgress] = useState(0); // 0-100 for auto-nav timer
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const stageRef = useRef(currentStage);

  stageRef.current = currentStage;

  // Hide hint after first interaction
  useEffect(() => {
    if (isRotating && showHint) {
      setShowHint(false);
    }
  }, [isRotating, showHint]);

  // Auto-hide hint after 8 seconds anyway
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 8000);
    return () => clearTimeout(t);
  }, []);

  // Auto-navigate timer when stopped on a stage with a route
  useEffect(() => {
    // Clear previous timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    setNavProgress(0);

    const route = STAGE_ROUTES[currentStage];
    if (!route || isRotating) return;

    // Start progress bar
    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / AUTO_NAV_DELAY) * 100);
      setNavProgress(pct);
    }, 50);

    // Auto-navigate after delay
    timerRef.current = setTimeout(() => {
      if (progressRef.current) clearInterval(progressRef.current);
      setNavProgress(100);
      navigate(STAGE_ROUTES[stageRef.current]);
    }, AUTO_NAV_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [currentStage, isRotating, navigate]);

  const adjustBiplaneForScreenSize = () => {
    let screenScale, screenPosition;
    if (window.innerWidth < 768) {
      screenScale = [1.5, 1.5, 1.5];
      screenPosition = [0, -1.5, 0];
    } else {
      screenScale = [3, 3, 3];
      screenPosition = [0, -4, -4];
    }
    return [screenScale, screenPosition];
  };

  const adjustIslandForScreenSize = () => {
    let screenScale, screenPosition;
    if (window.innerWidth < 768) {
      screenScale = [0.9, 0.9, 0.9];
      screenPosition = [0, -6.5, -43.4];
    } else {
      screenScale = [1, 1, 1];
      screenPosition = [0, -6.5, -43.4];
    }
    return [screenScale, screenPosition];
  };

  const [biplaneScale, biplanePosition] = adjustBiplaneForScreenSize();
  const [islandScale, islandPosition] = adjustIslandForScreenSize();

  const route = STAGE_ROUTES[currentStage];

  return (
    <>
      {/* Premium dark "Linear/Vercel" hero — sits above the existing 3D island.
          Pure CSS + inline SVG, no AmbientBlobs / aurora. */}
      <section className='luxe-stage relative min-h-screen w-full overflow-hidden flex items-center'>
        {/* Ambient orbs — soft amber/rose anchor behind the hero text. */}
        <div aria-hidden className='ambient-orb absolute -top-32 left-1/2 -translate-x-1/2 opacity-70' />
        <div aria-hidden className='ambient-orb ambient-orb-cool absolute top-1/3 -right-40 opacity-60' />

        {/* Decorative bezier curve — sits behind the text, low opacity, violet glow. */}
        <svg
          className='pointer-events-none absolute inset-0 w-full h-full z-0'
          viewBox='0 0 1440 900'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          <defs>
            <filter id='heroCurveGlow' x='-20%' y='-20%' width='140%' height='140%'>
              <feGaussianBlur stdDeviation='6' result='blur' />
              <feMerge>
                <feMergeNode in='blur' />
                <feMergeNode in='SourceGraphic' />
              </feMerge>
            </filter>
            <linearGradient id='heroCurveStroke' x1='0%' y1='100%' x2='100%' y2='0%'>
              <stop offset='0%' stopColor='#8b5cf6' stopOpacity='0' />
              <stop offset='35%' stopColor='#8b5cf6' stopOpacity='0.55' />
              <stop offset='75%' stopColor='#5e6ad2' stopOpacity='0.75' />
              <stop offset='100%' stopColor='#22d3ee' stopOpacity='0.45' />
            </linearGradient>
          </defs>
          <path
            d='M -50 820 C 280 760, 520 640, 760 440 S 1240 140, 1520 40'
            fill='none'
            stroke='url(#heroCurveStroke)'
            strokeWidth='1.6'
            strokeLinecap='round'
            filter='url(#heroCurveGlow)'
            opacity='0.85'
          />
          <path
            d='M -50 860 C 320 800, 560 700, 820 500 S 1280 200, 1560 80'
            fill='none'
            stroke='url(#heroCurveStroke)'
            strokeWidth='0.8'
            strokeLinecap='round'
            opacity='0.35'
          />
        </svg>

        {/* Brand pill only. The site-wide Navbar (top of page) already
            shows About / Work / AI / etc. — duplicating them here just
            made the header noisy. */}
        <div className='absolute top-24 left-0 right-0 z-20 flex items-center px-6 sm:px-10 lg:px-16'>
          <div className='luxe-pill'>
            <span className='inline-block w-1.5 h-1.5 rounded-full bg-amber-400' />
            Sid · Engineer
          </div>
        </div>

        {/* Hero content */}
        <div className='relative z-10 w-full px-6 sm:px-10 lg:px-16 py-24 sm:py-32'>
          <div className='max-w-4xl'>
            <p className='eyebrow-mono mb-6 flex items-center gap-2'>
              <span className='inline-block w-2 h-2 rounded-full bg-accent-emerald animate-pulse' />
              Currently building · 2026
            </p>

            <h1 className='gradient-text-amber font-poppins font-black tracking-tight leading-[0.95] text-5xl sm:text-6xl md:text-7xl lg:text-8xl'>
              Full-Stack
              <br />
              AI Engineer
            </h1>

            <p className='mt-7 max-w-2xl leading-relaxed text-fg-secondary text-base sm:text-lg'>
              Building intelligent applications &amp; scalable solutions — full-stack engineering,
              generative AI, and 5090-powered creative tooling.
            </p>

            <div className='mt-10 flex flex-wrap items-center gap-3'>
              <button
                onClick={() => navigate('/projects')}
                className='luxe-btn luxe-btn-primary !px-6 !py-3 !text-sm tap-44'
              >
                View Work
                <span aria-hidden='true' className='ml-0.5'>→</span>
              </button>
              <button
                onClick={() => navigate('/contact')}
                className='luxe-btn luxe-btn-secondary !px-6 !py-3 !text-sm tap-44'
              >
                Get in Touch
              </button>
            </div>

            <p className='text-fg-muted !text-xs mt-6 flex items-center gap-2'>
              <span className='inline-block w-1 h-1 rounded-full bg-fg-muted' />
              Open to opportunities · Indo connect · Remote-friendly
            </p>
          </div>
        </div>

        {/* Scroll cue — readable but not loud. Animated chevron + a
            small glow ring so it's hard to miss at first paint but
            doesn't compete with the headline. */}
        <div className='absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 pointer-events-none'>
          <span className='text-[11px] tracking-[0.3em] uppercase text-gray-300/90 font-semibold'>
            Scroll to explore
          </span>
          <div className='relative w-10 h-10 flex items-center justify-center'>
            <span className='absolute inset-0 rounded-full border border-amber-400/40 animate-ping' />
            <span className='absolute inset-1.5 rounded-full bg-amber-500/10 backdrop-blur-sm border border-amber-400/40' />
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor'
              strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'
              className='relative text-amber-200 animate-bounce'>
              <path d='M6 9l6 6 6-6' />
            </svg>
          </div>
        </div>
      </section>

      <section className='w-full h-screen relative'>
        <div className='absolute top-28 left-0 right-0 z-10 flex items-center justify-center'>
          {currentStage && <HomeInfo currentStage={currentStage} />}
        </div>

      <Canvas
        className={`w-full h-screen bg-transparent ${
          isRotating ? "cursor-grabbing" : "cursor-grab"
        }`}
        camera={{ near: 0.1, far: 1000 }}
      >
        <Suspense fallback={<Loader />}>
          <directionalLight position={[1, 1, 1]} intensity={2} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 5, 10]} intensity={2} />
          <spotLight
            position={[0, 50, 10]}
            angle={0.15}
            penumbra={1}
            intensity={2}
          />
          <hemisphereLight
            skyColor='#b1e1ff'
            groundColor='#000000'
            intensity={1}
          />

          <Bird />
          <Sky isRotating={isRotating} />
          <Island
            isRotating={isRotating}
            setIsRotating={setIsRotating}
            setCurrentStage={setCurrentStage}
            position={islandPosition}
            rotation={[0.1, 4.7077, 0]}
            scale={islandScale}
          />
          <Plane
            isRotating={isRotating}
            position={biplanePosition}
            rotation={[0, 20.1, 0]}
            scale={biplaneScale}
          />
        </Suspense>
      </Canvas>

      {/* Drag hint — shows on first load */}
      {showHint && (
        <div className='absolute bottom-20 sm:bottom-24 left-0 right-0 z-10 flex justify-center pointer-events-none px-4'>
          <div className='flex items-center gap-2 sm:gap-3 bg-white/90 backdrop-blur-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg shadow-sm
                          animate-bounce max-w-[90vw]' style={{ animationDuration: '2s' }}>
            <div className='text-xs sm:text-sm text-gray-700'>
              <span className='font-semibold'>Drag left or right</span> to explore
              <br />
              <span className='text-gray-400 text-[10px] sm:text-xs'>Stop at each station to learn more</span>
            </div>
          </div>
        </div>
      )}

      {/* Auto-navigate progress bar — shows when stopped on a stage */}
      {route && !isRotating && navProgress > 0 && (
        <div className='absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 pointer-events-none'>
          <span className='text-xs text-white/60 font-medium' style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
            Auto-redirecting in {Math.max(0, Math.ceil((AUTO_NAV_DELAY - navProgress * AUTO_NAV_DELAY / 100) / 1000))}s...
          </span>
          <div className='w-40 h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm'>
            <div
              className='h-full bg-cyan-400 rounded-full'
              style={{ width: `${navProgress}%`, transition: 'width 0.05s linear' }}
            />
          </div>
        </div>
      )}

        {/* Stage dots indicator */}
        <div className='absolute bottom-14 left-1/2 -translate-x-1/2 z-10 flex gap-2'>
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                currentStage === s
                  ? 'bg-amber-400 scale-125'
                  : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </section>
    </>
  );
};

export default Home;
