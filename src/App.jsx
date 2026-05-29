import { lazy, Suspense, useEffect } from "react";
import { Route, BrowserRouter as Router, Routes, useLocation, Navigate } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import { Footer, Navbar } from "./components";
import BackToTop from './components/BackToTop';
import EasterEgg from './components/EasterEgg';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import NoticeStack from './components/NoticeStack';
import { VaultProvider } from './contexts/VaultContext';
import VaultModal from './components/VaultModal';

// Lazy import wrapper that auto-recovers from Vite/Vercel chunk-hash
// mismatches. After a deploy, an open tab still has the OLD index.html
// referencing chunks with old hashes (e.g. ImageEnhancer-559d1b9a.js).
// New build replaced those chunks with new hashes (-72ac1f00.js), so the
// fetch 404s and `Failed to fetch dynamically imported module` throws.
// One hard-reload pulls the new index.html which references the right
// chunks. We key the throttle off the FAILING CHUNK URL so navigating
// through two stale routes back-to-back each gets its own reload chance
// — a single global throttle burns through with one route and surfaces
// the second as a crash, which is exactly what the user kept seeing.
export const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const URL_RE = /https?:\/\/\S+?\.m?js\b/;
const RELOAD_KEY_PREFIX = 'sid-chunk-reload:';

export function tryChunkReload(err) {
  const msg = err?.message || (typeof err === 'string' ? err : '');
  if (!msg || !CHUNK_RE.test(msg)) return false;
  const m = URL_RE.exec(msg);
  const key = `${RELOAD_KEY_PREFIX}${m ? m[0] : 'unknown'}`;
  const last = Number(sessionStorage.getItem(key) || '0');
  // 5min per-URL cooldown — long enough that a genuine 404 doesn't loop,
  // short enough that we'll retry after the next deploy if it happens.
  if (Date.now() - last <= 5 * 60_000) return false;
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
  return true;
}

const lazyWithReload = (importFn) => lazy(() =>
  importFn().catch((err) => {
    if (tryChunkReload(err)) {
      // Never-resolving promise keeps the Suspense fallback up while the
      // browser tears down for reload — React never sees the throw.
      return new Promise(() => {});
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
const ChessPage = lazyWithReload(() => import("./pages/Chess"));
const ChessLive = lazyWithReload(() => import("./pages/ChessLive"));
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
const Settings = lazyWithReload(() => import("./pages/Settings"));
const Runner = lazyWithReload(() => import("./pages/Runner"));
const SummarizerPage = lazyWithReload(() => import("./pages/SummarizerPage"));
const YoutubeDl = lazyWithReload(() => import("./pages/YoutubeDl"));
const HandTracking = lazyWithReload(() => import("./pages/HandTracking"));
const LipSync = lazyWithReload(() => import("./pages/LipSync"));
const AudioStudio = lazyWithReload(() => import("./pages/AudioStudio"));
const Cinema = lazyWithReload(() => import("./pages/Cinema"));
const AIVideoDetail = lazyWithReload(() => import("./pages/AIVideoDetail"));
const ImageEnhancerDetail = lazyWithReload(() => import("./pages/ImageEnhancerDetail"));
const LipsyncDetail = lazyWithReload(() => import("./pages/LipsyncDetail"));
const AudioDetail = lazyWithReload(() => import("./pages/AudioDetail"));
const CinemaDetail = lazyWithReload(() => import("./pages/CinemaDetail"));
const CinemaRenderPage = lazyWithReload(() => import("./pages/CinemaRenderPage"));
const SplatViewer = lazyWithReload(() => import("./pages/SplatViewer"));
const Showreel = lazyWithReload(() => import("./pages/Showreel"));
const RoomDesign = lazyWithReload(() => import("./pages/RoomDesign"));
const VideoEditor = lazyWithReload(() => import("./pages/VideoEditor"));
const VideoLibrary = lazyWithReload(() => import("./pages/VideoLibrary"));

/* ── Skeleton building blocks ──
 * The legacy hand-rolled pulse blocks (Light/Dark/Science/etc) are
 * still referenced below for safety, but every Suspense fallback now
 * uses the antd-Skeleton-based <PageLoader /> for a polished animated
 * placeholder. Old skeletons can be removed in a follow-up cleanup.
 */
import PageLoader from './components/PageLoader';
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

/* ── Document title manager ──
 * Sets the browser-tab title based on the active route. Previously
 * only a subset of pages (Chess, Settings, AIChat, etc.) called
 * document.title in their own useEffect, so navigating to one of
 * those and then to About / Home left the *previous* page's title
 * stuck. This component runs once on every navigation and writes a
 * route-specific title. Pages that still set document.title locally
 * will fire AFTER this effect and take precedence on their own
 * route — both behaviors are intentional. */
const ROUTE_TITLES = {
  '/'              : 'Siddharth Fulia · AI Engineer',
  '/about'         : 'About · Sid',
  '/projects'      : 'Projects · Sid',
  '/contact'       : 'Contact · Sid',
  '/lab'           : 'Interactive Lab · Sid',
  '/learn'         : 'Learn DSA · Sid',
  '/creative'      : 'Creative UI · Sid',
  '/chess'         : 'Chess · Sid',
  '/chess-classic' : 'Chess (classic) · Sid',
  '/chess-viz'     : 'Chess Viz · Sid',
  '/3d'            : '3D Studio · Sid',
  '/dragon'        : '3D Studio · Sid',
  '/ai'            : 'AI Chat · Sid',
  '/ai-video'      : 'AI Video Studio · Sid',
  '/image-enhancer': 'Image Studio · Sid',
  '/audio'         : 'Audio Studio · Sid',
  '/cinema'        : 'Cinema · Sid',
  '/hand'          : 'Hand Tracking · Sid',
  '/runner'        : 'Hand Runner · Sid',
  '/game'          : 'Hand Runner · Sid',
  '/summarizer'    : 'Summarizer · Sid',
  '/yt-dl'         : 'YouTube DL · Sid',
  '/science'       : 'Explore Space · Sid',
  '/explore'       : 'Web Playground · Sid',
  '/deepfake'      : 'Deepfake Studio · Sid',
  '/settings'      : 'Settings · Sid',
  '/vision'        : 'Vision AI · Sid',
  '/face'          : 'Vision AI · Sid',
  '/lipsync'       : 'Lip Sync · Sid',
  '/splat'         : 'Splat Viewer · Sid',
  '/showreel'      : 'Showreel · Sid',
  '/room'          : 'Room Designer · Sid',
  '/edit'          : 'Video Editor · Sid',
  '/edit/library'  : 'Edited Videos · Sid',
};
const DEFAULT_TITLE = 'Siddharth Fulia · AI Engineer';
const TitleManager = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    // Exact match first; then prefix match for nested routes
    // like /science/:module, /explore/:module, /render/:id, etc.
    let title = ROUTE_TITLES[pathname];
    if (!title) {
      const prefix = Object.keys(ROUTE_TITLES).find(
        (p) => p !== '/' && pathname.startsWith(p + '/')
      );
      title = prefix ? ROUTE_TITLES[prefix] : DEFAULT_TITLE;
    }
    document.title = title;
  }, [pathname]);
  return null;
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
    <VaultProvider>
    <VaultModal />
    <main className='bg-slate-300/20'>
      <Router>
        <TitleManager />
        <Navbar />
        <RoutesWithBoundary>
        <Routes>
          <Route path='/' element={<Suspense fallback={<PageLoader variant="home" />}><Home /></Suspense>} />
          <Route path='/about' element={<Suspense fallback={<PageLoader />}><About /></Suspense>} />
          <Route path='/projects' element={<Suspense fallback={<PageLoader />}><Projects /></Suspense>} />
          <Route path='/contact' element={<Suspense fallback={<PageLoader />}><Contact /></Suspense>} />
          <Route path='/lab' element={<Suspense fallback={<PageLoader />}><Lab /></Suspense>} />
          <Route path='/learn' element={<Suspense fallback={<PageLoader />}><Learn /></Suspense>} />
          <Route path='/creative' element={<Suspense fallback={<PageLoader />}><Creative /></Suspense>} />
          {/* /chess — new Stockfish-backed page. Old custom-engine version
              still reachable at /chess-classic in case the new one needs
              triage during deploy. */}
          <Route path='/chess'         element={<Suspense fallback={<PageLoader />}><ChessPage /></Suspense>} />
          <Route path='/chess-classic' element={<Suspense fallback={<PageLoader />}><ChessViz /></Suspense>} />
          <Route path='/chess/m/:matchId' element={<Suspense fallback={<PageLoader />}><ChessLive /></Suspense>} />
          <Route path='/science' element={<Suspense fallback={<PageLoader />}><Science /></Suspense>} />
          <Route path='/science/:module' element={<Suspense fallback={<PageLoader />}><ScienceModule /></Suspense>} />
          <Route path='/vision' element={<Suspense fallback={<PageLoader />}><FaceDetection /></Suspense>} />
          <Route path='/face' element={<Suspense fallback={<PageLoader />}><FaceDetection /></Suspense>} />
          <Route path='/explore' element={<Suspense fallback={<PageLoader />}><Explore /></Suspense>} />
          <Route path='/explore/:module' element={<Suspense fallback={<PageLoader />}><ExploreModule /></Suspense>} />
          <Route path='/ai' element={<Suspense fallback={<PageLoader />}><AIChat /></Suspense>} />
          <Route path='/ai/:chatId' element={<Suspense fallback={<PageLoader />}><AIChat /></Suspense>} />
          {/* AI Video + Image Studio are fully public. Generate / browse / delete
              are all open. Only the "Save to Vault" toggle on the create UI
              prompts for the password (handled inline in each page). */}
          <Route path='/ai-video'        element={<Suspense fallback={<PageLoader />}><AIVideo /></Suspense>} />
          <Route path='/ai-video/:id'    element={<Suspense fallback={<PageLoader />}><AIVideoDetail /></Suspense>} />
          <Route path='/video'           element={<Suspense fallback={<PageLoader />}><AIVideo /></Suspense>} />
          <Route path='/image-enhancer'  element={<Suspense fallback={<PageLoader />}><ImageEnhancer /></Suspense>} />
          <Route path='/image-enhancer/:id' element={<Suspense fallback={<PageLoader />}><ImageEnhancerDetail /></Suspense>} />
          <Route path='/enhance'         element={<Suspense fallback={<PageLoader />}><ImageEnhancer /></Suspense>} />
          <Route path='/ai-studio'       element={<Suspense fallback={<PageLoader />}><AIStudio /></Suspense>} />
          <Route path='/3d'              element={<Suspense fallback={<PageLoader />}><Dragon3D /></Suspense>} />
          <Route path='/dragon'          element={<Suspense fallback={<PageLoader />}><Dragon3D /></Suspense>} />
          {/* Vault-gated lane — VaultGate inside the page handles the auth bounce. */}
          <Route path='/deepfake'        element={<Suspense fallback={<PageLoader />}><Deepfake /></Suspense>} />
          {/* Vault-gated admin dashboard — intentionally unlisted in the nav */}
          <Route path='/settings'        element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          {/* Hand-gesture endless runner — MediaPipe + Three.js */}
          <Route path='/runner'          element={<Suspense fallback={<PageLoader />}><Runner /></Suspense>} />
          <Route path='/game'            element={<Suspense fallback={<PageLoader />}><Runner /></Suspense>} />
          <Route path='/summarizer'      element={<Suspense fallback={<PageLoader />}><SummarizerPage /></Suspense>} />
          <Route path='/yt-dl'           element={<Suspense fallback={<PageLoader />}><YoutubeDl /></Suspense>} />
          <Route path='/youtube'         element={<Suspense fallback={<PageLoader />}><YoutubeDl /></Suspense>} />
          <Route path='/hand'            element={<Suspense fallback={<PageLoader />}><HandTracking /></Suspense>} />
          <Route path='/hands'           element={<Suspense fallback={<PageLoader />}><HandTracking /></Suspense>} />
          <Route path='/draw'            element={<Suspense fallback={<PageLoader />}><HandTracking /></Suspense>} />
          {/* Tier 3 Studio lanes — Lip Sync / Audio / Cinema */}
          <Route path='/lipsync'         element={<Suspense fallback={<PageLoader />}><LipSync /></Suspense>} />
          <Route path='/lipsync/:id'     element={<Suspense fallback={<PageLoader />}><LipsyncDetail /></Suspense>} />
          <Route path='/audio'           element={<Suspense fallback={<PageLoader />}><AudioStudio /></Suspense>} />
          <Route path='/audio/:id'       element={<Suspense fallback={<PageLoader />}><AudioDetail /></Suspense>} />
          <Route path='/audio-studio'    element={<Suspense fallback={<PageLoader />}><AudioStudio /></Suspense>} />
          {/* Cinema lives inside AI Video as a tab now — redirect the
              standalone /cinema URL so old links still resolve. */}
          <Route path='/cinema' element={<Navigate to="/ai-video?tab=cinema" replace />} />
          {/* Render page — resumable live-logs view tied to a single
              render attempt. Must be registered BEFORE /cinema/:id so
              /cinema/render/<renderId> isn't swallowed as a projectId. */}
          <Route path='/cinema/render/:renderId' element={<Suspense fallback={<PageLoader />}><CinemaRenderPage /></Suspense>} />
          <Route path='/cinema/:id' element={<Suspense fallback={<PageLoader />}><CinemaDetail /></Suspense>} />

          {/* Splat viewer — in-browser Gaussian splat camera. */}
          <Route path='/splat'    element={<Suspense fallback={<PageLoader />}><SplatViewer /></Suspense>} />
          <Route path='/splats'   element={<Navigate to='/splat' replace />} />
          {/* Showreel — cinematic scroll showcase of the AI video stack. */}
          <Route path='/showreel' element={<Suspense fallback={<PageLoader />}><Showreel /></Suspense>} />
          {/* Room Designer — upload a room video, get an AI critique +
              furniture suggestions, render the new room out as MP4. */}
          <Route path='/room'     element={<Suspense fallback={<PageLoader />}><RoomDesign /></Suspense>} />

          {/* Video Editor — OpenReel embedded in an iframe. */}
          <Route path='/edit'         element={<Suspense fallback={<PageLoader />}><VideoEditor  /></Suspense>} />
          <Route path='/edit/library' element={<Suspense fallback={<PageLoader />}><VideoLibrary /></Suspense>} />

          {/* Catch-all — any unknown URL bounces to home instead of 404.
              Visitors fat-fingering /settngs or /chses end up somewhere
              real instead of staring at a blank page. */}
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
        </RoutesWithBoundary>
        <ConditionalFooter />
      </Router>
      <BackToTop />
      <EasterEgg />
      <NoticeStack />
    </main>
    </VaultProvider>
    </ConfigProvider>
  );
};

export default App;
