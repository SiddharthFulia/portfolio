// Studio — showcase page for the AI Multi-Modal Generation demo
// component. It is a static eye-candy mock of an image / video / 3D-avatar
// generator. Each "Generate" button routes the user out to a real lane
// (Image Studio, AI Video, Cinema).
//
// The page itself uses the standard luxe-stage + AmbientBlobs (cool
// variant) backdrop so it matches the rest of the AI suite pages.

import AIMultiModalGenDemo from '../components/luxe/AIMultiModalGenDemo'
import AmbientBlobs from '../components/luxe/AmbientBlobs'

const Studio = () => {
  return (
    <div className="min-h-screen luxe-stage text-gray-100 pt-20 sm:pt-24 pb-16 overflow-x-hidden">
      <AmbientBlobs variant="cool" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
        <header className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full luxe-card mb-3">
            <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-300 font-semibold">
              Image · Video · 3D Avatar
            </span>
          </div>
          <h1 className="font-poppins font-black text-3xl sm:text-5xl md:text-6xl bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent leading-tight mb-2">
            Studio
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl mx-auto">
            A unified control panel for AI generation across modalities — pick a mode,
            tune the settings, and launch the real lane in a new tab.
          </p>
        </header>

        <AIMultiModalGenDemo />
      </div>
    </div>
  )
}

export default Studio
