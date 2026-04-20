import { NavLink, useLocation } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { logo } from "../assets/images";
import sakura from "../assets/sakura.mp3";

const Navbar = () => {
  const { pathname } = useLocation();
  const isDark = ['/lab', '/learn', '/creative', '/chess', '/science', '/face', '/vision', '/explore', '/ai'].some(r => pathname.startsWith(r));

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

  const navLinks = [
    { to: '/about', label: 'About' },
    { to: '/projects', label: 'Projects' },
    { to: '/contact', label: 'Contact' },
  ];

  const pillLinks = [
    { to: '/lab', label: 'Lab', activeClass: 'text-black bg-cyan-400 shadow-md',
      inactiveClass: 'text-white bg-gray-900 hover:bg-gray-800',
      inactiveDark: 'text-white bg-gray-900 hover:bg-gray-800' },
    { to: '/creative', label: 'Creative', activeClass: 'text-white bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 shadow-md shadow-pink-500/20',
      inactiveClass: 'text-white bg-pink-600 hover:bg-pink-500',
      inactiveDark: 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' },
    { to: '/science', label: 'Science', activeClass: 'text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20',
      inactiveClass: 'text-white bg-blue-700 hover:bg-blue-600',
      inactiveDark: 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' },
    { to: '/explore', label: 'Explore', activeClass: 'text-white bg-gradient-to-r from-red-500 to-amber-500 shadow-md shadow-red-500/20',
      inactiveClass: 'text-white bg-amber-700 hover:bg-amber-600',
      inactiveDark: 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' },
    { to: '/vision', label: 'Vision', activeClass: 'text-white bg-gradient-to-r from-purple-500 to-pink-600 shadow-md shadow-purple-500/20',
      inactiveClass: 'text-white bg-purple-700 hover:bg-purple-600',
      inactiveDark: 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' },
    { to: '/ai', label: 'AI', activeClass: 'text-white bg-gradient-to-r from-blue-500 to-cyan-500 shadow-md shadow-blue-500/20',
      inactiveClass: 'text-white bg-blue-700 hover:bg-blue-600',
      inactiveDark: 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700' },
  ];

  return (
    <header className={`header transition-colors ${isDark ? 'bg-gray-950/80 backdrop-blur-md' : ''}`}>
      <NavLink to='/'>
        <img src={logo} alt='logo' className='w-12 h-12 sm:w-16 sm:h-16 object-contain' />
      </NavLink>

      {/* Desktop nav */}
      <nav className='hidden md:flex items-center text-lg gap-5 font-medium'>
        {navLinks.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            isActive ? "text-blue-400" : isDark ? "text-gray-300 hover:text-white" : "text-black"}>
            {l.label}
          </NavLink>
        ))}
        {pillLinks.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${isActive ? l.activeClass : isDark ? l.inactiveDark : l.inactiveClass}`
          }>
            {l.label}
          </NavLink>
        ))}
        <a href="/resume.pdf" target="_blank" rel="noreferrer"
          className="text-sm px-4 py-2 rounded-lg text-white font-semibold
                     bg-gradient-to-r from-[#00c6ff] to-[#0072ff]
                     hover:opacity-90 hover:scale-105 transition-transform duration-150 shadow-sm">
          Resume
        </a>
        <MusicBtn playing={playing} toggleMusic={toggleMusic} isDark={isDark} />
      </nav>

      {/* Mobile: music + hamburger */}
      <div className='flex md:hidden items-center gap-3'>
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

      {/* Mobile menu */}
      {menuOpen && (
        <div className={`absolute top-full left-0 right-0 z-50 py-4 px-6 flex flex-col gap-3 shadow-xl border-t
          ${isDark ? 'bg-gray-950/95 backdrop-blur-lg border-gray-800' : 'bg-white/95 backdrop-blur-lg border-gray-200'}`}>
          {navLinks.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) =>
              `py-2 text-base font-medium ${isActive ? 'text-blue-400' : isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {l.label}
            </NavLink>
          ))}
          <div className='flex flex-wrap gap-2 mt-1'>
            {pillLinks.map(l => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) =>
                `text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${isActive ? l.activeClass : isDark ? l.inactiveDark : l.inactiveClass}`
              }>
                {l.label}
              </NavLink>
            ))}
          </div>
          <a href="/resume.pdf" target="_blank" rel="noreferrer"
            className="text-sm px-4 py-2 rounded-lg text-white font-semibold text-center
                       bg-gradient-to-r from-[#00c6ff] to-[#0072ff] shadow-sm mt-1">
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
