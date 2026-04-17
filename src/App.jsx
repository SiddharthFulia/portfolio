import { lazy, Suspense } from "react";
import { Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import { Footer, Navbar } from "./components";

/* ── Lazy page imports ── */
const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const Projects = lazy(() => import("./pages/Projects"));
const Contact = lazy(() => import("./pages/Contact"));
const Lab = lazy(() => import("./pages/Lab"));
const Learn = lazy(() => import("./pages/Learn"));
const Creative = lazy(() => import("./pages/Creative"));
const ChessViz = lazy(() => import("./pages/ChessViz"));
const Science = lazy(() => import("./pages/Science"));
const ScienceModule = lazy(() => import("./pages/ScienceModule"));

/* ── Skeleton building blocks ── */
const B = "animate-pulse bg-slate-200 rounded";
const BD = "animate-pulse bg-gray-800 rounded";

/* ── Light page skeletons (About, Projects, Contact) ── */
const LightPageSkeleton = () => (
  <div className="max-w-5xl mx-auto px-8 sm:px-16 pt-28 pb-16 space-y-8">
    <div className={`${B} h-10 w-64`} />
    <div className={`${B} h-5 w-96 max-w-full`} />
    <div className="space-y-4 mt-8">
      {[1,2,3].map(i => (
        <div key={i} className={`${B} h-28`} style={{borderRadius:12}} />
      ))}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className={`${B} h-20`} style={{borderRadius:10}} />
      ))}
    </div>
  </div>
);

/* ── Home skeleton (3D scene area) ── */
const HomeSkeleton = () => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-sky-100 to-sky-200">
    <div className="flex flex-col items-center gap-4">
      <div className="w-14 h-14 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  </div>
);

/* ── Dark page skeletons (Lab, Creative, Learn, Chess, Science) ── */
const DarkPageSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-6">
    <div className="max-w-6xl mx-auto space-y-6">
      <div className={`${BD} h-12 w-72`} />
      <div className={`${BD} h-5 w-96 max-w-full`} />
      <div className="flex gap-6 mt-4">
        {[1,2,3].map(i => <div key={i} className={`${BD} h-8 w-20`} />)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
        {[...Array(8)].map((_, i) => (
          <div key={i} className={`${BD} h-32`} style={{borderRadius:12}} />
        ))}
      </div>
    </div>
  </div>
);

/* ── Science index skeleton ── */
const ScienceSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-6">
    <div className="max-w-6xl mx-auto space-y-6">
      <div className={`${BD} h-6 w-32`} style={{borderRadius:20}} />
      <div className={`${BD} h-16 w-80`} />
      <div className={`${BD} h-5 w-[28rem] max-w-full`} />
      <div className="flex gap-6 mt-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="text-center space-y-1">
            <div className={`${BD} h-9 w-14 mx-auto`} />
            <div className={`${BD} h-3 w-16`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {[...Array(10)].map((_, i) => (
          <div key={i} className={`${BD} h-24`} style={{borderRadius:16}} />
        ))}
      </div>
    </div>
  </div>
);

/* ── Science module skeleton ── */
const ScienceModuleSkeleton = () => (
  <div className="min-h-screen bg-gray-950 pt-28 px-6">
    <div className="max-w-6xl mx-auto space-y-5">
      <div className={`${BD} h-4 w-28`} />
      <div className="flex items-center gap-3">
        <div className={`${BD} h-1 w-12`} />
        <div className={`${BD} h-10 w-64`} />
        <div className={`${BD} h-6 w-16`} />
      </div>
      <div className={`${BD} h-px w-full`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[1,2,3,4].map(i => <div key={i} className={`${BD} h-24`} style={{borderRadius:12}} />)}
      </div>
      <div className={`${BD} h-64 w-full`} style={{borderRadius:12}} />
      <div className="space-y-3">
        {[1,2,3,4].map(i => <div key={i} className={`${BD} h-20`} style={{borderRadius:12}} />)}
      </div>
    </div>
  </div>
);

/* ── Contact skeleton ── */
const ContactSkeleton = () => (
  <div className="max-w-5xl mx-auto px-8 sm:px-16 pt-28 pb-16">
    <div className={`${B} h-10 w-48 mb-6`} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className={`${B} h-14`} style={{borderRadius:8}} />)}
        <div className={`${B} h-32`} style={{borderRadius:8}} />
        <div className={`${B} h-12 w-40`} style={{borderRadius:8}} />
      </div>
      <div className={`${B} h-80`} style={{borderRadius:16}} />
    </div>
  </div>
);

const App = () => {
  return (
    <main className='bg-slate-300/20'>
      <Router>
        <Navbar />
        <Routes>
          <Route path='/' element={
            <Suspense fallback={<HomeSkeleton />}><Home /></Suspense>
          } />
          <Route
            path='/*'
            element={
              <>
                <Routes>
                  <Route path='/about' element={
                    <Suspense fallback={<LightPageSkeleton />}><About /></Suspense>
                  } />
                  <Route path='/projects' element={
                    <Suspense fallback={<LightPageSkeleton />}><Projects /></Suspense>
                  } />
                  <Route path='/contact' element={
                    <Suspense fallback={<ContactSkeleton />}><Contact /></Suspense>
                  } />
                  <Route path='/lab' element={
                    <Suspense fallback={<DarkPageSkeleton />}><Lab /></Suspense>
                  } />
                  <Route path='/learn' element={
                    <Suspense fallback={<DarkPageSkeleton />}><Learn /></Suspense>
                  } />
                  <Route path='/creative' element={
                    <Suspense fallback={<DarkPageSkeleton />}><Creative /></Suspense>
                  } />
                  <Route path='/chess' element={
                    <Suspense fallback={<DarkPageSkeleton />}><ChessViz /></Suspense>
                  } />
                  <Route path='/science' element={
                    <Suspense fallback={<ScienceSkeleton />}><Science /></Suspense>
                  } />
                  <Route path='/science/:module' element={
                    <Suspense fallback={<ScienceModuleSkeleton />}><ScienceModule /></Suspense>
                  } />
                </Routes>
                <Footer />
              </>
            }
          />
        </Routes>
      </Router>
    </main>
  );
};

export default App;
