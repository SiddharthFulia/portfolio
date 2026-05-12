import { NavLink, useLocation } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { logo } from "../assets/images";
import sakura from "../assets/sakura.mp3";

const Navbar = () => {
  const { pathname } = useLocation();
  const isDark = ['/lab', '/learn', '/creative', '/chess', '/science', '/face', '/vision', '/explore', '/ai', '/studio', '/ai-video', '/video'].some(r => pathname.startsWith(r));

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const a = new Audio(sakura);
    a.volume = 0.4;
    a.loop = true;
    audioRef.current = a;
    return () => { a.pause(); a.src = ''; };
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(p => !p);
  };

  const [moreOpen, setMoreOpen] = useState(false);

  // Primary nav — always visible
  const primaryLinks = [
    { to: '/about', label: 'About' },
    { to: '/projects', label: 'Projects' },
    { to: '/contact', label: 'Contact' },
  ];

  // Featured pills — AI stuff first for peak interest
  const featuredPills = [
    { to: '/ai', label: 'AI Chat', color: 'from-blue-500 to-cyan-500' },
    { to: '/ai-video', label: 'AI Video', color: 'from-cyan-500 via-purple-500 to-amber-500' },
    { to: '/vision', label: 'Vision AI', color: 'from-purple-500 to-pink-600' },
    { to: '/image-enhancer', label: 'Image Studio', color: 'from-cyan-300 via-fuchsia-400 to-amber-300' },
    { to: '/science', label: 'Science', color: 'from-cyan-500 to-blue-600' },
    { to: '/explore', label: 'Explore', color: 'from-red-500 to-amber-500' },
  ];

  // More dropdown items
  const moreLinks = [
    { to: '/lab', label: 'Interactive Lab' },
    { to: '/creative', label: 'Creative UI' },
    { to: '/learn', label: 'Learn DSA' },
  ];

  return (
    <header className={`header transition-colors ${isDark ? 'bg-gray-950/80 backdrop-blur-md' : ''}`}>
      <NavLink to='/' className="shrink-0">
        <img src={logo} alt='logo' className='w-12 h-12 sm:w-14 sm:h-14 object-contain' />
      </NavLink>

      {/* Desktop nav */}
      <nav className='hidden lg:flex items-center gap-2 font-medium'>
        {/* Primary links */}
        {primaryLinks.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `text-sm px-2 transition-colors ${isActive ? 'text-blue-400' : isDark ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-black'}`}>
            {l.label}
          </NavLink>
        ))}

        <div className={`w-px h-4 mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

        {/* Featured pills */}
        {featuredPills.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `text-[11px] px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isActive
                ? `text-white bg-gradient-to-r ${l.color} shadow-md`
                : isDark
                  ? 'text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700'
                  : 'text-gray-600 hover:text-black bg-gray-100 hover:bg-gray-200'
            }`}>
            {l.label}
          </NavLink>
        ))}

        {/* More dropdown */}
        <div className="relative">
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`text-[11px] px-2.5 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
              moreOpen
                ? 'text-cyan-400 bg-gray-800'
                : isDark ? 'text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700' : 'text-gray-600 hover:text-black bg-gray-100 hover:bg-gray-200'
            }`}>
            More
            <svg className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
              <div className={`absolute top-full right-0 mt-1 py-1 rounded-xl shadow-xl border min-w-[160px] z-50 ${
                isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
              }`}>
                {moreLinks.map(l => (
                  <NavLink key={l.to} to={l.to} onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `block px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? 'text-cyan-400'
                          : isDark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-700 hover:text-black hover:bg-gray-50'
                      }`}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`w-px h-4 mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

        <a href="/resume.pdf" target="_blank" rel="noreferrer"
          className="text-[11px] px-3 py-1.5 rounded-lg text-white font-semibold
                     bg-gradient-to-r from-[#00c6ff] to-[#0072ff]
                     hover:opacity-90 transition-opacity">
          Resume
        </a>
        <MusicBtn playing={playing} toggleMusic={toggleMusic} isDark={isDark} />
      </nav>

      {/* Mobile: music + hamburger */}
      <div className='flex lg:hidden items-center gap-3'>
        <MusicBtn playing={playing} toggleMusic={toggleMusic} isDark={isDark} />
        <button onClick={() => setMenuOpen(o => !o)}
          className={`w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg transition-colors
            ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}>
          <span className={`block w-5 h-0.5 rounded-full transition-all duration-300 ${isDark ? 'bg-gray-300' : 'bg-gray-600'}
            ${menuOpen ? 'rotate-45 translate-y-[4px]' : ''}`} />
          <span className={`block w-5 h-0.5 rounded-full transition-all duration-300 ${isDark ? 'bg-gray-300' : 'bg-gray-600'}
            ${menuOpen ? '-rotate-45 -translate-y-[4px]' : ''}`} />
        </button>
      </div>

      {/* Mobile menu backdrop — closes menu on outside tap */}
      {menuOpen && (
        <div className="fixed inset-0 top-16 z-40 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)} />
      )}

      {/* Mobile menu */}
      {menuOpen && (
        <div className={`absolute top-full left-0 right-0 z-50 py-4 px-6 flex flex-col gap-1 shadow-xl border-t
          ${isDark ? 'bg-gray-950/95 border-gray-800' : 'bg-white/95 border-gray-200'}`}>

          {/* AI & Cool stuff first */}
          <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 pt-2 pb-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>AI & Tools</div>
          {featuredPills.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) =>
              `py-2.5 px-2 text-sm font-medium rounded-lg ${isActive ? 'text-cyan-400 bg-cyan-500/10' : isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {l.label}
            </NavLink>
          ))}

          {/* Main pages */}
          <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 pt-3 pb-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Pages</div>
          {primaryLinks.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) =>
              `py-2.5 px-2 text-sm font-medium rounded-lg ${isActive ? 'text-blue-400 bg-blue-500/10' : isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {l.label}
            </NavLink>
          ))}

          {/* More */}
          <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 pt-3 pb-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Demos</div>
          {moreLinks.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) =>
              `py-2.5 px-2 text-sm font-medium rounded-lg ${isActive ? 'text-purple-400 bg-purple-500/10' : isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {l.label}
            </NavLink>
          ))}

          <a href="/resume.pdf" target="_blank" rel="noreferrer"
            className="text-sm px-4 py-2.5 rounded-lg text-white font-semibold text-center
                       bg-gradient-to-r from-[#00c6ff] to-[#0072ff] shadow-sm mt-3">
            Resume
          </a>
        </div>
      )}
    </header>
  );
};

const MusicBtn = ({ playing, toggleMusic, isDark }) => (
  <button onClick={toggleMusic}
    className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
      playing
        ? isDark ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                 : 'bg-blue-100 text-blue-600 shadow-md shadow-blue-200'
        : isDark ? 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
                 : 'bg-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-300'
    }`}
    title={playing ? 'Pause music' : 'Play music'}>
    {playing ? (
      <>
        <div className='flex items-end gap-[2px] h-3.5'>
          <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '60%', animationDelay: '0s', animationDuration: '0.6s' }} />
          <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '100%', animationDelay: '0.15s', animationDuration: '0.5s' }} />
          <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '40%', animationDelay: '0.3s', animationDuration: '0.7s' }} />
          <span className='w-[3px] bg-current rounded-full animate-bounce' style={{ height: '80%', animationDelay: '0.1s', animationDuration: '0.55s' }} />
        </div>
        <span className='absolute inset-0 rounded-full border-2 border-current opacity-30 animate-ping' style={{ animationDuration: '2s' }} />
      </>
    ) : (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="18" r="4" /><path d="M12 18V2l7 4" />
      </svg>
    )}
  </button>
);

export default Navbar;
