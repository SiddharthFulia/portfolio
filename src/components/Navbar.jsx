import { NavLink, useLocation } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { logo } from "../assets/images";
import sakura from "../assets/sakura.mp3";

const Navbar = () => {
  const { pathname } = useLocation();
  const isDark = pathname.startsWith('/lab') || pathname.startsWith('/learn') || pathname.startsWith('/creative') || pathname.startsWith('/chess');

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Create audio once
  useEffect(() => {
    const a = new Audio(sakura);
    a.volume = 0.4;
    a.loop = true;
    audioRef.current = a;
    return () => { a.pause(); a.src = ''; };
  }, []);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(p => !p);
  };

  return (
    <header className={`header transition-colors ${isDark ? 'bg-gray-950/80 backdrop-blur-md' : ''}`}>
      <NavLink to='/'>
        <img src={logo} alt='logo' className='w-16 h-16 object-contain' />
      </NavLink>
      <nav className='flex items-center text-lg gap-5 font-medium'>
        <NavLink to='/about' className={({ isActive }) =>
          isActive ? "text-blue-400" : isDark ? "text-gray-300 hover:text-white" : "text-black"}>
          About
        </NavLink>
        <NavLink to='/projects' className={({ isActive }) =>
          isActive ? "text-blue-400" : isDark ? "text-gray-300 hover:text-white" : "text-black"}>
          Projects
        </NavLink>
        <NavLink to='/lab' className={({ isActive }) =>
          isActive
            ? "text-sm px-4 py-2 rounded-lg text-black font-semibold bg-cyan-400 shadow-md"
            : "text-sm px-4 py-2 rounded-lg text-white font-semibold bg-gray-900 hover:bg-gray-800 transition-colors"
        }>
          Lab
        </NavLink>
        <NavLink to='/learn' className={({ isActive }) =>
          isActive
            ? "text-sm px-4 py-2 rounded-lg text-black font-semibold bg-purple-400 shadow-md"
            : `text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${isDark ? 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' : 'text-white bg-purple-700 hover:bg-purple-600'}`
        }>
          Learn
        </NavLink>
        <NavLink to='/creative' className={({ isActive }) =>
          isActive
            ? "text-sm px-4 py-2 rounded-lg text-white font-semibold bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 shadow-md shadow-pink-500/20"
            : `text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${isDark ? 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' : 'text-white bg-pink-600 hover:bg-pink-500'}`
        }>
          Creative
        </NavLink>
        <a
          href="/resume.pdf"
          target="_blank"
          rel="noreferrer"
          className="text-sm px-4 py-2 rounded-lg text-white font-semibold
                     bg-gradient-to-r from-[#00c6ff] to-[#0072ff]
                     hover:opacity-90 hover:scale-105 transition-transform duration-150 shadow-sm"
        >
          Resume
        </a>

        {/* Music toggle */}
        <button
          onClick={toggleMusic}
          className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
            playing
              ? isDark
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-blue-100 text-blue-600 shadow-md shadow-blue-200'
              : isDark
                ? 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
                : 'bg-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-300'
          }`}
          title={playing ? 'Pause music' : 'Play music'}
        >
          {playing ? (
            <>
              {/* Animated sound bars */}
              <div className='flex items-end gap-[2px] h-3.5'>
                <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '60%', animationDelay: '0s', animationDuration: '0.6s' }} />
                <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '100%', animationDelay: '0.15s', animationDuration: '0.5s' }} />
                <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '40%', animationDelay: '0.3s', animationDuration: '0.7s' }} />
                <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '80%', animationDelay: '0.1s', animationDuration: '0.55s' }} />
              </div>
              {/* Pulse ring */}
              <span className='absolute inset-0 rounded-full border-2 border-current opacity-30 animate-ping' style={{ animationDuration: '2s' }} />
            </>
          ) : (
            /* Music note icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="18" r="4" />
              <path d="M12 18V2l7 4" />
            </svg>
          )}
        </button>
      </nav>
    </header>
  );
};

export default Navbar;
