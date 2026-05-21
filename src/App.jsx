import { lazy, Suspense } from "react";
import { Route, BrowserRouter as Router, Routes, useLocation, Navigate } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import { Footer, Navbar } from "./components";
import BackToTop from './components/BackToTop';
import EasterEgg from './components/EasterEgg';
import RouteErrorBoundary from './components/RouteErrorBoundary';

// Lazy import wrapper that auto-recovers from Vite/Vercel chunk-hash
// mismatches. After a deploy, an open tab still has the OLD index.html
// referencing chunks with old hashes (e.g. ImageEnhancer-559d1b9a.js).
// New build replaced those chunks with new hashes (-72ac1f00.js), so the
// fetch 404s and `Failed to fetch dynamically imported module` throws.
// One hard-reload pulls the new index.html which references the right
// chunks. sessionStorage guard prevents an infinite reload loop if the
// import legitimately fails for some other reason.
const RELOAD_KEY = 'sid-chunk-reload-at';
const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const lazyWithReload = (importFn) => lazy(() =>
  importFn().catch((err) => {
    if (err && typeof err.message === 'string' && CHUNK_RE.test(err.message)) {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
      const now = Date.now();
      // Only reload once per 30s window — protects against real (non-deploy) issues.
      if (now - last > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(now));
        window.location.reload();
        // Return a Promise that never resolves so React doesn't try to render
        // a fallback in the millisecond before the reload actually fires.
        return new Promise(() => {});
      }
    }
    throw err;
  })
);
// PageTransition removed 2026-05 — the fade/slide on every route was the
// "flashy switch" the user wanted gone. Routes now render directly.
// VaultGate is now used inline inside each page (only for the "Save to
// Vault" toggle), not as a page-level gate.

/* ── Lazy page imports ── */
const Home = lazyWithReload(() => import("./pages/Home"));
const About = lazyWithReload(() => import("./pages/About"));
const Projects = lazyWithReload(() => import("./pages/Projects"));
const Contact = lazyWithReload(() => import("./pages/Contact"));
const Lab = lazyWithReload(() => import("./pages/Lab"));
const Learn = lazyWithReload(() => import("./pages/Learn"));
const Creative = lazyWithReload(() => import("./pages/Creative"));
const ChessViz = lazyWithReload(() => import("./pages/ChessViz"));
const Science = lazyWithReload(() => import("./pages/Science"));
const ScienceModule = lazyWithReload(() => import("./pages/ScienceModule"));
const FaceDetection = lazyWithReload(() => import("./pages/FaceDetection"));
const Explore = lazyWithReload(() => import("./pages/Explore"));
const ExploreModule = lazyWithReload(() => import("./pages/ExploreModule"));
const AIChat = lazyWithReload(() => import("./pages/AIChat"));
const AIVideo = lazyWithReload(() => import("./pages/AIVideo"));
const ImageEnhancer = lazyWithReload(() => import("./pages/ImageEnhancer"));
const AIStudio = lazyWithReload(() => import("./pages/AIStudio"));
const Dragon3D = lazyWithReload(() => import("./pages/Dragon3D"));
const Deepfake = lazyWithReload(() => import("./pages/Deepfake"));
const Runner = lazyWithReload(() => import("./pages/Runner"));
const SummarizerPage = lazyWithReload(() => import("./pages/SummarizerPage"));
const HandTracking = lazyWithReload(() => import("./pages/HandTracking"));
const LipSync = lazyWithReload(() => import("./pages/LipSync"));
const AudioStudio = lazyWithReload(() => import("./pages/AudioStudio"));
const Cinema = lazyWithReload(() => import("./pages/Cinema"));
const AIVideoDetail = lazyWithReload(() => import("./pages/AIVideoDetail"));
const ImageEnhancerDetail = lazyWithReload(() => import("./pages/ImageEnhancerDetail"));
const LipsyncDetail = lazyWithReload(() => import("./pages/LipsyncDetail"));
const AudioDetail = lazyWithReload(() => import("./pages/AudioDetail"));
const CinemaDetail = lazyWithReload(() => import("./pages/CinemaDetail"));

/* ── Skeleton building blocks ── */
const B = "animate-pulse bg-slate-200 rounded";
const BD = "animate-pulse bg-gray-800 rounded";

// About / Projects / Contact were rewritten with a dark theme (#0a0a0e
// matches their <section> bg). The old skeleton was bg-slate-200, which
// caused a white flash before the page rendered — visibly jarring.
// Now matches the page bg so the transition is invisible.
const LightPageSkeleton = () => (
  <div className="min-h-screen bg-[#0a0a0e] pt-28 px-6 pb-16">
    <div className="max-w-5xl mx-auto space-y-8">
      <div className={`${BD} h-10 w-64`} />
      <div className={`${BD} h-5 w-96 max-w-full`} />
      <div className="space-y-4 mt-8">
        {[1,2,3].map(i => <div key={i} className={`${BD} h-28`} style={{borderRadius:12}} />)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        {[1,2,3,4,5,6].map(i => <div key={i} className={`${BD} h-20`} style={{borderRadius:10}} />)}
      </div>
    </div>
  </div>
);

const HomeSkeleton = () => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-sky-100 to-sky-200">
    <div className="w-14 h-14 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

const DarkPageSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-6">
    <div className="max-w-6xl mx-auto space-y-6">
      <div className={`${BD} h-12 w-72`} />
      <div className={`${BD} h-5 w-96 max-w-full`} />
      <div className="flex gap-6 mt-4">
        {[1,2,3].map(i => <div key={i} className={`${BD} h-8 w-20`} />)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
        {[...Array(8)].map((_, i) => <div key={i} className={`${BD} h-32`} style={{borderRadius:12}} />)}
      </div>
    </div>
  </div>
);

const ScienceSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-6">
    <div className="max-w-6xl mx-auto space-y-6">
      <div className={`${BD} h-6 w-32`} style={{borderRadius:20}} />
      <div className={`${BD} h-16 w-80`} />
      <div className={`${BD} h-5 w-[28rem] max-w-full`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {[...Array(10)].map((_, i) => <div key={i} className={`${BD} h-24`} style={{borderRadius:16}} />)}
      </div>
    </div>
  </div>
);

const ScienceModuleSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-6">
    <div className="max-w-6xl mx-auto space-y-5">
      <div className={`${BD} h-4 w-28`} />
      <div className="flex items-center gap-3">
        <div className={`${BD} h-1 w-12`} />
        <div className={`${BD} h-10 w-64`} />
      </div>
      <div className={`${BD} h-px w-full`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[1,2,3,4].map(i => <div key={i} className={`${BD} h-24`} style={{borderRadius:12}} />)}
      </div>
      <div className={`${BD} h-64 w-full`} style={{borderRadius:12}} />
    </div>
  </div>
);

const AIVideoSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-5 sm:px-6">
    <div className="max-w-6xl mx-auto space-y-5">
      <div className={`${BD} h-6 w-44`} style={{borderRadius:20}} />
      <div className={`${BD} h-12 w-72`} />
      <div className={`${BD} h-4 w-96 max-w-full`} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[1,2].map(i => <div key={i} className={`${BD} h-20`} style={{borderRadius:12}} />)}
          </div>
          <div className={`${BD} h-24`} style={{borderRadius:12}} />
          <div className="grid grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className={`${BD} h-14`} style={{borderRadius:8}} />)}
          </div>
          <div className={`${BD} h-12`} style={{borderRadius:8}} />
        </div>
        <div className="lg:col-span-2">
          <div className={`${BD}`} style={{aspectRatio:'9/16',borderRadius:16}} />
        </div>
      </div>
    </div>
  </div>
);

const ContactSkeleton = () => (
  <div className="min-h-screen bg-[#0a0a0e] pt-28 px-6 pb-16">
    <div className="max-w-5xl mx-auto">
      <div className={`${BD} h-10 w-48 mb-6`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className={`${BD} h-14`} style={{borderRadius:8}} />)}
          <div className={`${BD} h-32`} style={{borderRadius:8}} />
          <div className={`${BD} h-12 w-40`} style={{borderRadius:8}} />
        </div>
        <div className={`${BD} h-80`} style={{borderRadius:16}} />
      </div>
    </div>
  </div>
);

/* ── Conditional footer (hidden on home) ── */
const ConditionalFooter = () => {
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  return <Footer />;
};

/* ── Site-wide route error boundary ──
 * Wraps every <Routes> render. Keying it on pathname means each
 * navigation mounts a FRESH boundary instance, so an error on one page
 * doesn't stick around when you move to another. Without this, a render
 * exception in a lazy page bubbles up to the root and unmounts the whole
 * tree → "page just goes blank" feeling the user reported. */
const RoutesWithBoundary = ({ children }) => {
  const { pathname } = useLocation();
  return <RouteErrorBoundary key={pathname}>{children}</RouteErrorBoundary>;
};

const App = () => {
  return (
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
      token: { colorPrimary: '#22d3ee', borderRadius: 10, colorBgContainer: '#111827', colorBgElevated: '#1f2937', colorBorder: '#374151' },
    }}>
    <main className='bg-slate-300/20'>
      <Router>
        <Navbar />
        <RoutesWithBoundary>
        <Routes>
          <Route path='/' element={<Suspense fallback={<HomeSkeleton />}><Home /></Suspense>} />
          <Route path='/about' element={<Suspense fallback={<LightPageSkeleton />}><About /></Suspense>} />
          <Route path='/projects' element={<Suspense fallback={<LightPageSkeleton />}><Projects /></Suspense>} />
          <Route path='/contact' element={<Suspense fallback={<ContactSkeleton />}><Contact /></Suspense>} />
          <Route path='/lab' element={<Suspense fallback={<DarkPageSkeleton />}><Lab /></Suspense>} />
          <Route path='/learn' element={<Suspense fallback={<DarkPageSkeleton />}><Learn /></Suspense>} />
          <Route path='/creative' element={<Suspense fallback={<DarkPageSkeleton />}><Creative /></Suspense>} />
          <Route path='/chess' element={<Suspense fallback={<DarkPageSkeleton />}><ChessViz /></Suspense>} />
          <Route path='/science' element={<Suspense fallback={<ScienceSkeleton />}><Science /></Suspense>} />
          <Route path='/science/:module' element={<Suspense fallback={<ScienceModuleSkeleton />}><ScienceModule /></Suspense>} />
          <Route path='/vision' element={<Suspense fallback={<DarkPageSkeleton />}><FaceDetection /></Suspense>} />
          <Route path='/face' element={<Suspense fallback={<DarkPageSkeleton />}><FaceDetection /></Suspense>} />
          <Route path='/explore' element={<Suspense fallback={<DarkPageSkeleton />}><Explore /></Suspense>} />
          <Route path='/explore/:module' element={<Suspense fallback={<DarkPageSkeleton />}><ExploreModule /></Suspense>} />
          <Route path='/ai' element={<Suspense fallback={<DarkPageSkeleton />}><AIChat /></Suspense>} />
          <Route path='/ai/:chatId' element={<Suspense fallback={<DarkPageSkeleton />}><AIChat /></Suspense>} />
          {/* AI Video + Image Studio are fully public. Generate / browse / delete
              are all open. Only the "Save to Vault" toggle on the create UI
              prompts for the password (handled inline in each page). */}
          <Route path='/ai-video'        element={<Suspense fallback={<AIVideoSkeleton />}><AIVideo /></Suspense>} />
          <Route path='/ai-video/:id'    element={<Suspense fallback={<DarkPageSkeleton />}><AIVideoDetail /></Suspense>} />
          <Route path='/video'           element={<Suspense fallback={<AIVideoSkeleton />}><AIVideo /></Suspense>} />
          <Route path='/image-enhancer'  element={<Suspense fallback={<DarkPageSkeleton />}><ImageEnhancer /></Suspense>} />
          <Route path='/image-enhancer/:id' element={<Suspense fallback={<DarkPageSkeleton />}><ImageEnhancerDetail /></Suspense>} />
          <Route path='/enhance'         element={<Suspense fallback={<DarkPageSkeleton />}><ImageEnhancer /></Suspense>} />
          <Route path='/ai-studio'       element={<Suspense fallback={<DarkPageSkeleton />}><AIStudio /></Suspense>} />
          <Route path='/3d'              element={<Suspense fallback={<DarkPageSkeleton />}><Dragon3D /></Suspense>} />
          <Route path='/dragon'          element={<Suspense fallback={<DarkPageSkeleton />}><Dragon3D /></Suspense>} />
          {/* Vault-gated lane — VaultGate inside the page handles the auth bounce. */}
          <Route path='/deepfake'        element={<Suspense fallback={<DarkPageSkeleton />}><Deepfake /></Suspense>} />
          {/* Hand-gesture endless runner — MediaPipe + Three.js */}
          <Route path='/runner'          element={<Suspense fallback={<DarkPageSkeleton />}><Runner /></Suspense>} />
          <Route path='/game'            element={<Suspense fallback={<DarkPageSkeleton />}><Runner /></Suspense>} />
          <Route path='/summarizer'      element={<Suspense fallback={<DarkPageSkeleton />}><SummarizerPage /></Suspense>} />
          <Route path='/hand'            element={<Suspense fallback={<DarkPageSkeleton />}><HandTracking /></Suspense>} />
          <Route path='/hands'           element={<Suspense fallback={<DarkPageSkeleton />}><HandTracking /></Suspense>} />
          <Route path='/draw'            element={<Suspense fallback={<DarkPageSkeleton />}><HandTracking /></Suspense>} />
          {/* Tier 3 Studio lanes — Lip Sync / Audio / Cinema */}
          <Route path='/lipsync'         element={<Suspense fallback={<DarkPageSkeleton />}><LipSync /></Suspense>} />
          <Route path='/lipsync/:id'     element={<Suspense fallback={<DarkPageSkeleton />}><LipsyncDetail /></Suspense>} />
          <Route path='/audio'           element={<Suspense fallback={<DarkPageSkeleton />}><AudioStudio /></Suspense>} />
          <Route path='/audio/:id'       element={<Suspense fallback={<DarkPageSkeleton />}><AudioDetail /></Suspense>} />
          <Route path='/audio-studio'    element={<Suspense fallback={<DarkPageSkeleton />}><AudioStudio /></Suspense>} />
          {/* Cinema lives inside AI Video as a tab now — redirect the
              standalone /cinema URL so old links still resolve. */}
          <Route path='/cinema' element={<Navigate to="/ai-video?tab=cinema" replace />} />
          <Route path='/cinema/:id' element={<Suspense fallback={<DarkPageSkeleton />}><CinemaDetail /></Suspense>} />
        </Routes>
        </RoutesWithBoundary>
        <ConditionalFooter />
      </Router>
      <BackToTop />
      <EasterEgg />
    </main>
    </ConfigProvider>
  );
};

export default App;
