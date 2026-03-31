import { Canvas } from "@react-three/fiber";
import { Suspense, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { HomeInfo, Loader } from "../components";
import { Bird, Island, Plane, Sky } from "../models";

const STAGE_ROUTES = { 2: '/about', 3: '/projects', 4: '/contact' };
const AUTO_NAV_DELAY = 5000; // 5 seconds

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
        <div className='absolute bottom-24 left-0 right-0 z-10 flex justify-center pointer-events-none'>
          <div className='flex items-center gap-3 bg-white/90 backdrop-blur-sm px-5 py-3 rounded-full shadow-lg
                          animate-bounce' style={{ animationDuration: '2s' }}>
            <span className='text-2xl'>👆</span>
            <div className='text-sm text-gray-700'>
              <span className='font-semibold'>Drag left or right</span> to explore the island
              <br />
              <span className='text-gray-400 text-xs'>Stop at each station to learn more</span>
            </div>
            <span className='text-lg'>↔</span>
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
              className='h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full'
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
                ? 'bg-blue-400 scale-125 shadow-md shadow-blue-400/50'
                : 'bg-white/30'
            }`}
          />
        ))}
      </div>
    </section>
  );
};

export default Home;
