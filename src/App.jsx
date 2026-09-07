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
const Algorithms = lazyWithReload(() => import("./pages/Algorithms"));

/* ── Algorithms topic pages (30 total). Every route lives at
 *    /algorithms/:slug and mounts a page that composes shared
 *    primitives from src/components/algorithms. Kept as separate
 *    chunks so each visualiser is only fetched when its route is
 *    hit — the hub page stays lean. */
const AlgArrays          = lazyWithReload(() => import("./pages/algorithms/Arrays"));
const AlgLinkedLists     = lazyWithReload(() => import("./pages/algorithms/LinkedLists"));
const AlgStacks          = lazyWithReload(() => import("./pages/algorithms/Stacks"));
const AlgQueues          = lazyWithReload(() => import("./pages/algorithms/Queues"));
const AlgHashTables      = lazyWithReload(() => import("./pages/algorithms/HashTables"));
const AlgGraphs          = lazyWithReload(() => import("./pages/algorithms/Graphs"));
const AlgTrees           = lazyWithReload(() => import("./pages/algorithms/Trees"));
const AlgBST             = lazyWithReload(() => import("./pages/algorithms/BST"));
const AlgBalancedTrees   = lazyWithReload(() => import("./pages/algorithms/BalancedTrees"));
const AlgHeaps           = lazyWithReload(() => import("./pages/algorithms/Heaps"));
const AlgTries           = lazyWithReload(() => import("./pages/algorithms/Tries"));
const AlgSegmentTrees    = lazyWithReload(() => import("./pages/algorithms/SegmentTrees"));
const AlgFenwickTrees    = lazyWithReload(() => import("./pages/algorithms/FenwickTrees"));
const AlgDSU             = lazyWithReload(() => import("./pages/algorithms/DSU"));
const AlgMST             = lazyWithReload(() => import("./pages/algorithms/MST"));
const AlgDivideConquer   = lazyWithReload(() => import("./pages/algorithms/DivideConquer"));
const AlgSorting         = lazyWithReload(() => import("./pages/algorithms/Sorting"));
const AlgSearching       = lazyWithReload(() => import("./pages/algorithms/Searching"));
const AlgSieve           = lazyWithReload(() => import("./pages/algorithms/Sieve"));
const AlgKMP             = lazyWithReload(() => import("./pages/algorithms/KMP"));
const AlgGreedyIntervals = lazyWithReload(() => import("./pages/algorithms/GreedyIntervals"));
const AlgGreedyKnapsack  = lazyWithReload(() => import("./pages/algorithms/GreedyKnapsack"));
const AlgDPKnapsack      = lazyWithReload(() => import("./pages/algorithms/DPKnapsack"));
const AlgDPLCS           = lazyWithReload(() => import("./pages/algorithms/DPLCS"));
const AlgDPLIS           = lazyWithReload(() => import("./pages/algorithms/DPLIS"));
const AlgConvexHull      = lazyWithReload(() => import("./pages/algorithms/ConvexHull"));
const AlgGraphTraversal  = lazyWithReload(() => import("./pages/algorithms/GraphTraversal"));
const AlgFloydWarshall   = lazyWithReload(() => import("./pages/algorithms/FloydWarshall"));
const AlgDijkstraBellman = lazyWithReload(() => import("./pages/algorithms/DijkstraBellman"));
const AlgTopologicalSort = lazyWithReload(() => import("./pages/algorithms/TopologicalSort"));
// /creative was merged into /lab (30 demos, one page). Old URLs now
// redirect via the route below — no more standalone Creative page.
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
const VideoEditor         = lazyWithReload(() => import("./pages/VideoEditor"));
const VideoEditorAdvanced = lazyWithReload(() => import("./pages/VideoEditorAdvanced"));
const VideoLibrary        = lazyWithReload(() => import("./pages/VideoLibrary"));
const Realism             = lazyWithReload(() => import("./pages/Realism"));
const RealismLibrary      = lazyWithReload(() => import("./pages/RealismLibrary"));
const RealismJob          = lazyWithReload(() => import("./pages/RealismJob"));
const SimpleGame          = lazyWithReload(() => import("./pages/SimpleGame"));
const PhysicsLab          = lazyWithReload(() => import("./pages/PhysicsLab"));
const Pathfinding         = lazyWithReload(() => import("./pages/Pathfinding"));
const Chernobyl           = lazyWithReload(() => import("./pages/Chernobyl"));
const Atoms               = lazyWithReload(() => import("./pages/Atoms"));
const GestureMemes        = lazyWithReload(() => import("./pages/GestureMemes"));
const GestureHammy        = lazyWithReload(() => import("./pages/GestureHammy"));
const Osint               = lazyWithReload(() => import("./pages/OsintHub"));
const QRCompiler          = lazyWithReload(() => import("./pages/QRCompiler"));
const QRShare             = lazyWithReload(() => import("./pages/QRShare"));

import GlassFilter from './components/GlassFilter';

/* ── Skeleton building blocks ──
 * Every Suspense fallback now uses the branded <PageBoot /> — a full
 * screen LuxeLoader (cosmos variant) with a rotating quip. Old hand-
 * rolled pulse blocks + antd PageLoader are kept dormant below only
 * so anything still referencing them in a stale chunk doesn't crash;
 * they're unreferenced in the live route table.
 */
import { PageBoot } from './components/loaders';
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
  '/learn'         : 'Algorithms · Sid',
  '/algorithms'    : 'Algorithms · Sid',
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
  '/simple-game'   : 'Simple Games · Sid',
  '/physics'       : 'Physics Lab · Sid',
  '/engineering'   : 'Physics Lab · Sid',
  '/pathfinding'   : 'Pathfinding Lab · Sid',
  '/routes'        : 'Pathfinding Lab · Sid',
  '/chernobyl'     : 'Chernobyl RBMK · Sid',
  '/atoms'         : 'Atom · Nuclear Playground · Sid',
  '/gesture-memes' : 'Gesture Memes · Sid',
  '/gesture-hammy' : 'Hammy Hamster · Sid',
  '/summarizer'    : 'Summarizer · Sid',
  '/yt-dl'         : 'YouTube DL · Sid',
  '/science'       : 'Cosmos · NASA hub · Sid',
  '/explore'       : 'Web Playground · Sid',
  '/deepfake'      : 'Persona Studio · Sid',
  '/persona'       : 'Persona Studio · Sid',
  '/settings'      : 'Settings · Sid',
  '/vision'        : 'Vision AI · Sid',
  '/face'          : 'Vision AI · Sid',
  '/lipsync'       : 'Lip Sync · Sid',
  '/splat'         : 'Splat Viewer · Sid',
  '/showreel'      : 'Showreel · Sid',
  '/room'          : 'Room Designer · Sid',
  '/edit'          : 'Video Editor · Sid',
  '/edit/advanced' : 'Timeline Editor · Sid',
  '/edit/library'  : 'Edited Videos · Sid',
  '/realism'         : 'Realism Lab · Sid',
  '/realism/library' : 'Realism Library · Sid',
  '/osint'           : 'OSINT Powerhouse · Sid',
  '/tools'           : 'OSINT Powerhouse · Sid',
  '/qr'              : 'QR Compiler · Sid',
  '/qr/s'            : 'Scan · Sid',
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
    <GlassFilter />
    <main className='bg-slate-300/20'>
      <Router>
        <TitleManager />
        <Navbar />
        <RoutesWithBoundary>
        <Routes>
          <Route path='/' element={<Suspense fallback={<PageBoot variant="cosmos" />}><Home /></Suspense>} />
          <Route path='/about' element={<Suspense fallback={<PageBoot />}><About /></Suspense>} />
          <Route path='/projects' element={<Suspense fallback={<PageBoot />}><Projects /></Suspense>} />
          <Route path='/contact' element={<Suspense fallback={<PageBoot />}><Contact /></Suspense>} />
          <Route path='/lab' element={<Suspense fallback={<PageBoot />}><Lab /></Suspense>} />
          {/* /learn was renamed to /algorithms — DSA hub rebuilt from
              markdown tutorials into 30 interactive visualisers with
              scrubbable animation, KaTeX proofs, and a real-world use
              case per topic. Old URL kept as a permanent redirect. */}
          <Route path='/algorithms' element={<Suspense fallback={<PageBoot />}><Algorithms /></Suspense>} />
          <Route path='/learn'      element={<Navigate to='/algorithms' replace />} />
          <Route path='/algorithms/arrays'           element={<Suspense fallback={<PageBoot />}><AlgArrays          /></Suspense>} />
          <Route path='/algorithms/linked-lists'     element={<Suspense fallback={<PageBoot />}><AlgLinkedLists     /></Suspense>} />
          <Route path='/algorithms/stacks'           element={<Suspense fallback={<PageBoot />}><AlgStacks          /></Suspense>} />
          <Route path='/algorithms/queues'           element={<Suspense fallback={<PageBoot />}><AlgQueues          /></Suspense>} />
          <Route path='/algorithms/hash-tables'      element={<Suspense fallback={<PageBoot />}><AlgHashTables      /></Suspense>} />
          <Route path='/algorithms/graphs'           element={<Suspense fallback={<PageBoot />}><AlgGraphs          /></Suspense>} />
          <Route path='/algorithms/trees'            element={<Suspense fallback={<PageBoot />}><AlgTrees           /></Suspense>} />
          <Route path='/algorithms/bst'              element={<Suspense fallback={<PageBoot />}><AlgBST             /></Suspense>} />
          <Route path='/algorithms/balanced-trees'   element={<Suspense fallback={<PageBoot />}><AlgBalancedTrees   /></Suspense>} />
          <Route path='/algorithms/heaps'            element={<Suspense fallback={<PageBoot />}><AlgHeaps           /></Suspense>} />
          <Route path='/algorithms/tries'            element={<Suspense fallback={<PageBoot />}><AlgTries           /></Suspense>} />
          <Route path='/algorithms/segment-trees'    element={<Suspense fallback={<PageBoot />}><AlgSegmentTrees    /></Suspense>} />
          <Route path='/algorithms/fenwick-trees'    element={<Suspense fallback={<PageBoot />}><AlgFenwickTrees    /></Suspense>} />
          <Route path='/algorithms/dsu'              element={<Suspense fallback={<PageBoot />}><AlgDSU             /></Suspense>} />
          <Route path='/algorithms/mst'              element={<Suspense fallback={<PageBoot />}><AlgMST             /></Suspense>} />
          <Route path='/algorithms/divide-conquer'   element={<Suspense fallback={<PageBoot />}><AlgDivideConquer   /></Suspense>} />
          <Route path='/algorithms/sorting'          element={<Suspense fallback={<PageBoot />}><AlgSorting         /></Suspense>} />
          <Route path='/algorithms/searching'        element={<Suspense fallback={<PageBoot />}><AlgSearching       /></Suspense>} />
          <Route path='/algorithms/sieve'            element={<Suspense fallback={<PageBoot />}><AlgSieve           /></Suspense>} />
          <Route path='/algorithms/kmp'              element={<Suspense fallback={<PageBoot />}><AlgKMP             /></Suspense>} />
          <Route path='/algorithms/greedy-intervals' element={<Suspense fallback={<PageBoot />}><AlgGreedyIntervals /></Suspense>} />
          <Route path='/algorithms/greedy-knapsack'  element={<Suspense fallback={<PageBoot />}><AlgGreedyKnapsack  /></Suspense>} />
          <Route path='/algorithms/dp-knapsack'      element={<Suspense fallback={<PageBoot />}><AlgDPKnapsack      /></Suspense>} />
          <Route path='/algorithms/dp-lcs'           element={<Suspense fallback={<PageBoot />}><AlgDPLCS           /></Suspense>} />
          <Route path='/algorithms/dp-lis'           element={<Suspense fallback={<PageBoot />}><AlgDPLIS           /></Suspense>} />
          <Route path='/algorithms/convex-hull'      element={<Suspense fallback={<PageBoot />}><AlgConvexHull      /></Suspense>} />
          <Route path='/algorithms/graph-traversal'  element={<Suspense fallback={<PageBoot />}><AlgGraphTraversal  /></Suspense>} />
          <Route path='/algorithms/floyd-warshall'   element={<Suspense fallback={<PageBoot />}><AlgFloydWarshall   /></Suspense>} />
          <Route path='/algorithms/dijkstra-bellman' element={<Suspense fallback={<PageBoot />}><AlgDijkstraBellman /></Suspense>} />
          <Route path='/algorithms/topological-sort' element={<Suspense fallback={<PageBoot />}><AlgTopologicalSort /></Suspense>} />
          {/* /creative merged into /lab. Old links redirect to the unified Lab. */}
          <Route path='/creative' element={<Navigate to='/lab' replace />} />
          {/* /chess — new Stockfish-backed page. Old custom-engine version
              still reachable at /chess-classic in case the new one needs
              triage during deploy. */}
          <Route path='/chess'         element={<Suspense fallback={<PageBoot />}><ChessPage /></Suspense>} />
          <Route path='/chess-classic' element={<Suspense fallback={<PageBoot />}><ChessViz /></Suspense>} />
          <Route path='/chess/m/:matchId' element={<Suspense fallback={<PageBoot />}><ChessLive /></Suspense>} />
          <Route path='/science' element={<Suspense fallback={<PageBoot />}><Science /></Suspense>} />
          <Route path='/science/:module' element={<Suspense fallback={<PageBoot />}><ScienceModule /></Suspense>} />
          <Route path='/vision' element={<Suspense fallback={<PageBoot />}><FaceDetection /></Suspense>} />
          <Route path='/face' element={<Suspense fallback={<PageBoot />}><FaceDetection /></Suspense>} />
          <Route path='/explore' element={<Suspense fallback={<PageBoot />}><Explore /></Suspense>} />
          <Route path='/explore/:module' element={<Suspense fallback={<PageBoot />}><ExploreModule /></Suspense>} />
          <Route path='/ai' element={<Suspense fallback={<PageBoot />}><AIChat /></Suspense>} />
          <Route path='/ai/:chatId' element={<Suspense fallback={<PageBoot />}><AIChat /></Suspense>} />
          {/* AI Video + Image Studio are fully public. Generate / browse / delete
              are all open. Only the "Save to Vault" toggle on the create UI
              prompts for the password (handled inline in each page). */}
          <Route path='/ai-video'        element={<Suspense fallback={<PageBoot />}><AIVideo /></Suspense>} />
          <Route path='/ai-video/:id'    element={<Suspense fallback={<PageBoot />}><AIVideoDetail /></Suspense>} />
          <Route path='/video'           element={<Suspense fallback={<PageBoot />}><AIVideo /></Suspense>} />
          <Route path='/image-enhancer'  element={<Suspense fallback={<PageBoot />}><ImageEnhancer /></Suspense>} />
          <Route path='/image-enhancer/:id' element={<Suspense fallback={<PageBoot />}><ImageEnhancerDetail /></Suspense>} />
          <Route path='/enhance'         element={<Suspense fallback={<PageBoot />}><ImageEnhancer /></Suspense>} />
          <Route path='/ai-studio'       element={<Suspense fallback={<PageBoot />}><AIStudio /></Suspense>} />
          <Route path='/3d'              element={<Suspense fallback={<PageBoot />}><Dragon3D /></Suspense>} />
          <Route path='/dragon'          element={<Suspense fallback={<PageBoot />}><Dragon3D /></Suspense>} />
          {/* Vault-gated lane — VaultGate inside the page handles the auth bounce. */}
          <Route path='/deepfake'        element={<Suspense fallback={<PageBoot />}><Deepfake /></Suspense>} />
          {/* Vault-gated admin dashboard — intentionally unlisted in the nav */}
          <Route path='/settings'        element={<Suspense fallback={<PageBoot />}><Settings /></Suspense>} />
          {/* Hand-gesture endless runner — MediaPipe + Three.js */}
          <Route path='/runner'          element={<Suspense fallback={<PageBoot />}><Runner /></Suspense>} />
          <Route path='/game'            element={<Suspense fallback={<PageBoot />}><Runner /></Suspense>} />
          <Route path='/simple-game'     element={<Suspense fallback={<PageBoot />}><SimpleGame /></Suspense>} />
          <Route path='/simple-game/:id' element={<Suspense fallback={<PageBoot />}><SimpleGame /></Suspense>} />
          <Route path='/physics'         element={<Suspense fallback={<PageBoot />}><PhysicsLab /></Suspense>} />
          <Route path='/engineering'     element={<Suspense fallback={<PageBoot />}><PhysicsLab /></Suspense>} />
          <Route path='/pathfinding'     element={<Suspense fallback={<PageBoot />}><Pathfinding /></Suspense>} />
          <Route path='/routes'          element={<Suspense fallback={<PageBoot />}><Pathfinding /></Suspense>} />
          <Route path='/chernobyl'       element={<Suspense fallback={<PageBoot />}><Chernobyl /></Suspense>} />
          <Route path='/atoms'           element={<Suspense fallback={<PageBoot />}><Atoms /></Suspense>} />
          <Route path='/gesture-memes'   element={<Suspense fallback={<PageBoot />}><GestureMemes /></Suspense>} />
          <Route path='/gesture-hammy'   element={<Suspense fallback={<PageBoot />}><GestureHammy /></Suspense>} />
          {/* OSINT Powerhouse — 150+ intel APIs (live telemetry + full catalog).
              `/tools` is an alias so both URLs resolve to the same page. */}
          <Route path='/osint'           element={<Suspense fallback={<PageBoot />}><Osint /></Suspense>} />
          <Route path='/tools'           element={<Suspense fallback={<PageBoot />}><Osint /></Suspense>} />
          {/* QR Compiler — pure FE Reed-Solomon studio, artistic + scan-tested.
              /qr/s/:id is the BE-backed public share page for a saved QR. */}
          <Route path='/qr'              element={<Suspense fallback={<PageBoot />}><QRCompiler /></Suspense>} />
          <Route path='/qr/s/:id'        element={<Suspense fallback={<PageBoot />}><QRShare /></Suspense>} />
          <Route path='/summarizer'      element={<Suspense fallback={<PageBoot />}><SummarizerPage /></Suspense>} />
          <Route path='/yt-dl'           element={<Suspense fallback={<PageBoot />}><YoutubeDl /></Suspense>} />
          <Route path='/youtube'         element={<Suspense fallback={<PageBoot />}><YoutubeDl /></Suspense>} />
          <Route path='/hand'            element={<Suspense fallback={<PageBoot />}><HandTracking /></Suspense>} />
          <Route path='/hands'           element={<Suspense fallback={<PageBoot />}><HandTracking /></Suspense>} />
          <Route path='/draw'            element={<Suspense fallback={<PageBoot />}><HandTracking /></Suspense>} />
          {/* Tier 3 Studio lanes — Lip Sync / Audio / Cinema */}
          <Route path='/lipsync'         element={<Suspense fallback={<PageBoot />}><LipSync /></Suspense>} />
          <Route path='/lipsync/:id'     element={<Suspense fallback={<PageBoot />}><LipsyncDetail /></Suspense>} />
          <Route path='/audio'           element={<Suspense fallback={<PageBoot />}><AudioStudio /></Suspense>} />
          <Route path='/audio/:id'       element={<Suspense fallback={<PageBoot />}><AudioDetail /></Suspense>} />
          <Route path='/audio-studio'    element={<Suspense fallback={<PageBoot />}><AudioStudio /></Suspense>} />
          {/* Cinema lives inside AI Video as a tab now — redirect the
              standalone /cinema URL so old links still resolve. */}
          <Route path='/cinema' element={<Navigate to="/ai-video?tab=cinema" replace />} />
          {/* Render page — resumable live-logs view tied to a single
              render attempt. Must be registered BEFORE /cinema/:id so
              /cinema/render/<renderId> isn't swallowed as a projectId. */}
          <Route path='/cinema/render/:renderId' element={<Suspense fallback={<PageBoot />}><CinemaRenderPage /></Suspense>} />
          <Route path='/cinema/:id' element={<Suspense fallback={<PageBoot />}><CinemaDetail /></Suspense>} />

          {/* Splat viewer — in-browser Gaussian splat camera. */}
          <Route path='/splat'    element={<Suspense fallback={<PageBoot />}><SplatViewer /></Suspense>} />
          <Route path='/splats'   element={<Navigate to='/splat' replace />} />
          {/* Showreel — cinematic scroll showcase of the AI video stack. */}
          <Route path='/showreel' element={<Suspense fallback={<PageBoot />}><Showreel /></Suspense>} />
          {/* Room Designer — upload a room video, get an AI critique +
              furniture suggestions, render the new room out as MP4. */}
          <Route path='/room'     element={<Suspense fallback={<PageBoot />}><RoomDesign /></Suspense>} />

          {/* Video Editor — OpenReel embedded in an iframe. */}
          <Route path='/edit'           element={<Suspense fallback={<PageBoot />}><VideoEditor          /></Suspense>} />
          <Route path='/edit/advanced'  element={<Suspense fallback={<PageBoot />}><VideoEditorAdvanced /></Suspense>} />
          <Route path='/edit/library'   element={<Suspense fallback={<PageBoot />}><VideoLibrary        /></Suspense>} />

          {/* Realism lab — sandbox for the Seedance-grade prompt
              enrichment + I2V pipeline. Sits next to /ai-video,
              doesn't replace it. */}
          <Route path='/realism'           element={<Suspense fallback={<PageBoot />}><Realism        /></Suspense>} />
          <Route path='/realism/library'   element={<Suspense fallback={<PageBoot />}><RealismLibrary /></Suspense>} />
          <Route path='/realism/job/:jobId' element={<Suspense fallback={<PageBoot />}><RealismJob    /></Suspense>} />

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
