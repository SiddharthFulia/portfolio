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
const AlgorithmsShell = lazyWithReload(() => import("./pages/AlgorithmsShell"));

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

/* ── Arcade hub + 50 games ──
 * The hub lives at /arcade. Each game gets its own /arcade/<slug> route.
 * All games share the <GameShell> primitive from components/arcade/. */
const Arcade = lazyWithReload(() => import("./pages/Arcade"));

const ArcadeBreakout        = lazyWithReload(() => import("./pages/arcade/Breakout"));
const ArcadeSpaceInvaders   = lazyWithReload(() => import("./pages/arcade/SpaceInvaders"));
const ArcadeAsteroids       = lazyWithReload(() => import("./pages/arcade/Asteroids"));
const ArcadeMissileCommand  = lazyWithReload(() => import("./pages/arcade/MissileCommand"));
const ArcadeFrogger         = lazyWithReload(() => import("./pages/arcade/Frogger"));
const ArcadeTetris          = lazyWithReload(() => import("./pages/arcade/Tetris"));
const ArcadeTwenty48        = lazyWithReload(() => import("./pages/arcade/Twenty48"));
const ArcadeSudoku          = lazyWithReload(() => import("./pages/arcade/Sudoku"));
const ArcadeMinesweeper     = lazyWithReload(() => import("./pages/arcade/Minesweeper"));
const ArcadeWordle          = lazyWithReload(() => import("./pages/arcade/Wordle"));
const ArcadeSolitaire       = lazyWithReload(() => import("./pages/arcade/Solitaire"));
const ArcadeBlackjack       = lazyWithReload(() => import("./pages/arcade/Blackjack"));
const ArcadePoker           = lazyWithReload(() => import("./pages/arcade/Poker"));
const ArcadeBaccarat        = lazyWithReload(() => import("./pages/arcade/Baccarat"));
const ArcadeRummy           = lazyWithReload(() => import("./pages/arcade/Rummy"));
const ArcadeConnectFour     = lazyWithReload(() => import("./pages/arcade/ConnectFour"));
const ArcadeReversi         = lazyWithReload(() => import("./pages/arcade/Reversi"));
const ArcadeCheckers        = lazyWithReload(() => import("./pages/arcade/Checkers"));
const ArcadeNineMensMorris  = lazyWithReload(() => import("./pages/arcade/NineMensMorris"));
const ArcadeChineseCheckers = lazyWithReload(() => import("./pages/arcade/ChineseCheckers"));
const ArcadePinball         = lazyWithReload(() => import("./pages/arcade/Pinball"));
const ArcadeGolf            = lazyWithReload(() => import("./pages/arcade/Golf"));
const ArcadeAngrySlings     = lazyWithReload(() => import("./pages/arcade/AngrySlings"));
const ArcadeRopeCutter      = lazyWithReload(() => import("./pages/arcade/RopeCutter"));
const ArcadeLineRider       = lazyWithReload(() => import("./pages/arcade/LineRider"));
const ArcadeFlappy          = lazyWithReload(() => import("./pages/arcade/Flappy"));
const ArcadeDoodleJump      = lazyWithReload(() => import("./pages/arcade/DoodleJump"));
const ArcadeIcyTower        = lazyWithReload(() => import("./pages/arcade/IcyTower"));
const ArcadeSubwayRunner    = lazyWithReload(() => import("./pages/arcade/SubwayRunner"));
const ArcadeTempleRunner    = lazyWithReload(() => import("./pages/arcade/TempleRunner"));
const ArcadePacman          = lazyWithReload(() => import("./pages/arcade/Pacman"));
const ArcadeCentipede       = lazyWithReload(() => import("./pages/arcade/Centipede"));
const ArcadeTempest         = lazyWithReload(() => import("./pages/arcade/Tempest"));
const ArcadeGalaga          = lazyWithReload(() => import("./pages/arcade/Galaga"));
const ArcadeDefender        = lazyWithReload(() => import("./pages/arcade/Defender"));
const ArcadeTowerDefense    = lazyWithReload(() => import("./pages/arcade/TowerDefense"));
const ArcadeMiniRts         = lazyWithReload(() => import("./pages/arcade/MiniRts"));
const ArcadeCityBuilder     = lazyWithReload(() => import("./pages/arcade/CityBuilder"));
const ArcadeSnakeAi         = lazyWithReload(() => import("./pages/arcade/SnakeAi"));
const ArcadeSokoban         = lazyWithReload(() => import("./pages/arcade/Sokoban"));
const ArcadeWhack           = lazyWithReload(() => import("./pages/arcade/Whack"));
const ArcadeSimon           = lazyWithReload(() => import("./pages/arcade/Simon"));
const ArcadeReaction        = lazyWithReload(() => import("./pages/arcade/Reaction"));
const ArcadeRhythmTap       = lazyWithReload(() => import("./pages/arcade/RhythmTap"));
const ArcadeBulletHell      = lazyWithReload(() => import("./pages/arcade/BulletHell"));
const ArcadeGameOfLife      = lazyWithReload(() => import("./pages/arcade/GameOfLife"));
const ArcadePowder          = lazyWithReload(() => import("./pages/arcade/Powder"));
const ArcadeIdleMiner       = lazyWithReload(() => import("./pages/arcade/IdleMiner"));
const ArcadeFarmingSim      = lazyWithReload(() => import("./pages/arcade/FarmingSim"));
const ArcadeFishingSim      = lazyWithReload(() => import("./pages/arcade/FishingSim"));

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
  '/arcade'          : 'Arcade · 50 games · Sid',
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
 * tree → "page just goes blank" feeling the user reported.
 *
 * EXCEPTION: `/algorithms/*` uses a shared layout route (see
 * AlgorithmsShell) that keeps the sidebar mounted across topic
 * navigation. Rekeying the boundary on every pathname change would
 * unmount that shared layout on each sidebar click — the exact flash
 * we're trying to fix. Collapse all algorithm topic paths to one key
 * so the boundary stays stable while the user browses topics. */
const boundaryKeyFor = (pathname) => {
  if (pathname === '/algorithms' || pathname.startsWith('/algorithms/')) {
    return '/algorithms';
  }
  return pathname;
};
const RoutesWithBoundary = ({ children }) => {
  const { pathname } = useLocation();
  return <RouteErrorBoundary key={boundaryKeyFor(pathname)}>{children}</RouteErrorBoundary>;
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
          <Route path='/learn'      element={<Navigate to='/algorithms' replace />} />
          {/* /algorithms hub is a leaf (index) route rendering the hub.
              Nested `/algorithms/:slug` routes share a layout route that
              renders <TopicShell> ONCE and swaps the topic body via
              <Outlet />. Prevents the whole-page-reload flash the user
              saw when every topic route mounted its own TopicShell. */}
          <Route path='/algorithms'>
            <Route index element={<Suspense fallback={<PageBoot />}><Algorithms /></Suspense>} />
            <Route element={<Suspense fallback={<PageBoot />}><AlgorithmsShell /></Suspense>}>
              <Route path='arrays'           element={<AlgArrays          />} />
              <Route path='linked-lists'     element={<AlgLinkedLists     />} />
              <Route path='stacks'           element={<AlgStacks          />} />
              <Route path='queues'           element={<AlgQueues          />} />
              <Route path='hash-tables'      element={<AlgHashTables      />} />
              <Route path='graphs'           element={<AlgGraphs          />} />
              <Route path='trees'            element={<AlgTrees           />} />
              <Route path='bst'              element={<AlgBST             />} />
              <Route path='balanced-trees'   element={<AlgBalancedTrees   />} />
              <Route path='heaps'            element={<AlgHeaps           />} />
              <Route path='tries'            element={<AlgTries           />} />
              <Route path='segment-trees'    element={<AlgSegmentTrees    />} />
              <Route path='fenwick-trees'    element={<AlgFenwickTrees    />} />
              <Route path='dsu'              element={<AlgDSU             />} />
              <Route path='mst'              element={<AlgMST             />} />
              <Route path='divide-conquer'   element={<AlgDivideConquer   />} />
              <Route path='sorting'          element={<AlgSorting         />} />
              <Route path='searching'        element={<AlgSearching       />} />
              <Route path='sieve'            element={<AlgSieve           />} />
              <Route path='kmp'              element={<AlgKMP             />} />
              <Route path='greedy-intervals' element={<AlgGreedyIntervals />} />
              <Route path='greedy-knapsack'  element={<AlgGreedyKnapsack  />} />
              <Route path='dp-knapsack'      element={<AlgDPKnapsack      />} />
              <Route path='dp-lcs'           element={<AlgDPLCS           />} />
              <Route path='dp-lis'           element={<AlgDPLIS           />} />
              <Route path='convex-hull'      element={<AlgConvexHull      />} />
              <Route path='graph-traversal'  element={<AlgGraphTraversal  />} />
              <Route path='floyd-warshall'   element={<AlgFloydWarshall   />} />
              <Route path='dijkstra-bellman' element={<AlgDijkstraBellman />} />
              <Route path='topological-sort' element={<AlgTopologicalSort />} />
            </Route>
          </Route>
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

          {/* Arcade — hub grid + 50 individual game routes. Every game
              is a lazy chunk so /arcade itself stays lean; only the
              clicked game's code loads. */}
          <Route path='/arcade'                    element={<Suspense fallback={<PageBoot />}><Arcade                /></Suspense>} />
          <Route path='/arcade/breakout'           element={<Suspense fallback={<PageBoot />}><ArcadeBreakout        /></Suspense>} />
          <Route path='/arcade/space-invaders'     element={<Suspense fallback={<PageBoot />}><ArcadeSpaceInvaders   /></Suspense>} />
          <Route path='/arcade/asteroids'          element={<Suspense fallback={<PageBoot />}><ArcadeAsteroids       /></Suspense>} />
          <Route path='/arcade/missile-command'    element={<Suspense fallback={<PageBoot />}><ArcadeMissileCommand  /></Suspense>} />
          <Route path='/arcade/frogger'            element={<Suspense fallback={<PageBoot />}><ArcadeFrogger         /></Suspense>} />
          <Route path='/arcade/tetris'             element={<Suspense fallback={<PageBoot />}><ArcadeTetris          /></Suspense>} />
          <Route path='/arcade/twenty48'           element={<Suspense fallback={<PageBoot />}><ArcadeTwenty48        /></Suspense>} />
          <Route path='/arcade/sudoku'             element={<Suspense fallback={<PageBoot />}><ArcadeSudoku          /></Suspense>} />
          <Route path='/arcade/minesweeper'        element={<Suspense fallback={<PageBoot />}><ArcadeMinesweeper     /></Suspense>} />
          <Route path='/arcade/wordle'             element={<Suspense fallback={<PageBoot />}><ArcadeWordle          /></Suspense>} />
          <Route path='/arcade/solitaire'          element={<Suspense fallback={<PageBoot />}><ArcadeSolitaire       /></Suspense>} />
          <Route path='/arcade/blackjack'          element={<Suspense fallback={<PageBoot />}><ArcadeBlackjack       /></Suspense>} />
          <Route path='/arcade/poker'              element={<Suspense fallback={<PageBoot />}><ArcadePoker           /></Suspense>} />
          <Route path='/arcade/baccarat'           element={<Suspense fallback={<PageBoot />}><ArcadeBaccarat        /></Suspense>} />
          <Route path='/arcade/rummy'              element={<Suspense fallback={<PageBoot />}><ArcadeRummy           /></Suspense>} />
          <Route path='/arcade/connect-four'       element={<Suspense fallback={<PageBoot />}><ArcadeConnectFour     /></Suspense>} />
          <Route path='/arcade/reversi'            element={<Suspense fallback={<PageBoot />}><ArcadeReversi         /></Suspense>} />
          <Route path='/arcade/checkers'           element={<Suspense fallback={<PageBoot />}><ArcadeCheckers        /></Suspense>} />
          <Route path='/arcade/nine-mens-morris'   element={<Suspense fallback={<PageBoot />}><ArcadeNineMensMorris  /></Suspense>} />
          <Route path='/arcade/chinese-checkers'   element={<Suspense fallback={<PageBoot />}><ArcadeChineseCheckers /></Suspense>} />
          <Route path='/arcade/pinball'            element={<Suspense fallback={<PageBoot />}><ArcadePinball         /></Suspense>} />
          <Route path='/arcade/golf'               element={<Suspense fallback={<PageBoot />}><ArcadeGolf            /></Suspense>} />
          <Route path='/arcade/angry-slings'       element={<Suspense fallback={<PageBoot />}><ArcadeAngrySlings     /></Suspense>} />
          <Route path='/arcade/rope-cutter'        element={<Suspense fallback={<PageBoot />}><ArcadeRopeCutter      /></Suspense>} />
          <Route path='/arcade/line-rider'         element={<Suspense fallback={<PageBoot />}><ArcadeLineRider       /></Suspense>} />
          <Route path='/arcade/flappy'             element={<Suspense fallback={<PageBoot />}><ArcadeFlappy          /></Suspense>} />
          <Route path='/arcade/doodle-jump'        element={<Suspense fallback={<PageBoot />}><ArcadeDoodleJump      /></Suspense>} />
          <Route path='/arcade/icy-tower'          element={<Suspense fallback={<PageBoot />}><ArcadeIcyTower        /></Suspense>} />
          <Route path='/arcade/subway-runner'      element={<Suspense fallback={<PageBoot />}><ArcadeSubwayRunner    /></Suspense>} />
          <Route path='/arcade/temple-runner'      element={<Suspense fallback={<PageBoot />}><ArcadeTempleRunner    /></Suspense>} />
          <Route path='/arcade/pacman'             element={<Suspense fallback={<PageBoot />}><ArcadePacman          /></Suspense>} />
          <Route path='/arcade/centipede'          element={<Suspense fallback={<PageBoot />}><ArcadeCentipede       /></Suspense>} />
          <Route path='/arcade/tempest'            element={<Suspense fallback={<PageBoot />}><ArcadeTempest         /></Suspense>} />
          <Route path='/arcade/galaga'             element={<Suspense fallback={<PageBoot />}><ArcadeGalaga          /></Suspense>} />
          <Route path='/arcade/defender'           element={<Suspense fallback={<PageBoot />}><ArcadeDefender        /></Suspense>} />
          <Route path='/arcade/tower-defense'      element={<Suspense fallback={<PageBoot />}><ArcadeTowerDefense    /></Suspense>} />
          <Route path='/arcade/mini-rts'           element={<Suspense fallback={<PageBoot />}><ArcadeMiniRts         /></Suspense>} />
          <Route path='/arcade/city-builder'       element={<Suspense fallback={<PageBoot />}><ArcadeCityBuilder     /></Suspense>} />
          <Route path='/arcade/snake-ai'           element={<Suspense fallback={<PageBoot />}><ArcadeSnakeAi         /></Suspense>} />
          <Route path='/arcade/sokoban'            element={<Suspense fallback={<PageBoot />}><ArcadeSokoban         /></Suspense>} />
          <Route path='/arcade/whack'              element={<Suspense fallback={<PageBoot />}><ArcadeWhack           /></Suspense>} />
          <Route path='/arcade/simon'              element={<Suspense fallback={<PageBoot />}><ArcadeSimon           /></Suspense>} />
          <Route path='/arcade/reaction'           element={<Suspense fallback={<PageBoot />}><ArcadeReaction        /></Suspense>} />
          <Route path='/arcade/rhythm-tap'         element={<Suspense fallback={<PageBoot />}><ArcadeRhythmTap       /></Suspense>} />
          <Route path='/arcade/bullet-hell'        element={<Suspense fallback={<PageBoot />}><ArcadeBulletHell      /></Suspense>} />
          <Route path='/arcade/game-of-life'       element={<Suspense fallback={<PageBoot />}><ArcadeGameOfLife      /></Suspense>} />
          <Route path='/arcade/powder'             element={<Suspense fallback={<PageBoot />}><ArcadePowder          /></Suspense>} />
          <Route path='/arcade/idle-miner'         element={<Suspense fallback={<PageBoot />}><ArcadeIdleMiner       /></Suspense>} />
          <Route path='/arcade/farming-sim'        element={<Suspense fallback={<PageBoot />}><ArcadeFarmingSim      /></Suspense>} />
          <Route path='/arcade/fishing-sim'        element={<Suspense fallback={<PageBoot />}><ArcadeFishingSim      /></Suspense>} />

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
