// IslandFlyScene — the original Home-page Three.js island scene,
// extracted so it can live on /3d (Island Fly tab) once the new
// ScrollCinematicHero takes over the homepage. The auto-redirect
// behaviour (stop on stage 2/3/4 → 3s timer → /about, /projects,
// /contact) is preserved here so the scene still works as a navigator.
import { Canvas } from "@react-three/fiber";
import { Suspense, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HomeInfo, Loader } from "../index.js";
import { Bird, Island, Plane, Sky } from "../../models/index.js";

const STAGE_ROUTES = { 2: "/about", 3: "/projects", 4: "/contact" };
const AUTO_NAV_DELAY = 3000;

export default function IslandFlyScene({ heightClass = "h-[72vh]" }) {
  const [currentStage, setCurrentStage] = useState(1);
  const [isRotating, setIsRotating] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [navProgress, setNavProgress] = useState(0);
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const stageRef = useRef(currentStage);
  stageRef.current = currentStage;

  useEffect(() => {
    if (isRotating && showHint) setShowHint(false);
  }, [isRotating, showHint]);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 8000);
    return () => clearTimeout(t);
  }, []);

  // Auto-navigate timer when stopped on a stage with a route
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    setNavProgress(0);

    const route = STAGE_ROUTES[currentStage];
    if (!route || isRotating) return;

    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / AUTO_NAV_DELAY) * 100);
      setNavProgress(pct);
    }, 50);

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
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return [[1.5, 1.5, 1.5], [0, -1.5, 0]];
    }
    return [[3, 3, 3], [0, -4, -4]];
  };

  const adjustIslandForScreenSize = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return [[0.9, 0.9, 0.9], [0, -6.5, -43.4]];
    }
    return [[1, 1, 1], [0, -6.5, -43.4]];
  };

  const [biplaneScale, biplanePosition] = adjustBiplaneForScreenSize();
  const [islandScale, islandPosition] = adjustIslandForScreenSize();
  const route = STAGE_ROUTES[currentStage];

  return (
    <section className={`luxe-card relative w-full ${heightClass} overflow-hidden`}>
      <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-center px-4">
        {currentStage && <HomeInfo currentStage={currentStage} />}
      </div>

      <Canvas
        className={`w-full h-full bg-transparent ${isRotating ? "cursor-grabbing" : "cursor-grab"}`}
        camera={{ near: 0.1, far: 1000 }}
      >
        <Suspense fallback={<Loader />}>
          <directionalLight position={[1, 1, 1]} intensity={2} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 5, 10]} intensity={2} />
          <spotLight position={[0, 50, 10]} angle={0.15} penumbra={1} intensity={2} />
          <hemisphereLight skyColor="#b1e1ff" groundColor="#000000" intensity={1} />

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

      {showHint && (
        <div className="absolute bottom-24 left-0 right-0 z-10 flex justify-center pointer-events-none px-4">
          <div
            className="flex items-center gap-3 bg-white/90 backdrop-blur-sm px-5 py-3 rounded-lg shadow-sm animate-bounce max-w-[90vw]"
            style={{ animationDuration: "2s" }}
          >
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Drag left or right</span> to explore
              <br />
              <span className="text-gray-400 text-xs">Stop at each station to learn more</span>
            </div>
          </div>
        </div>
      )}

      {route && !isRotating && navProgress > 0 && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 pointer-events-none">
          <span
            className="text-xs text-white/80 font-medium"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
          >
            Auto-redirecting in {Math.max(0, Math.ceil((AUTO_NAV_DELAY - navProgress * AUTO_NAV_DELAY / 100) / 1000))}s...
          </span>
          <div className="w-40 h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className="h-full bg-cyan-400 rounded-full"
              style={{ width: `${navProgress}%`, transition: "width 0.05s linear" }}
            />
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              currentStage === s ? "bg-amber-400 scale-125" : "bg-white/30"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
