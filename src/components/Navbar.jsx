import { NavLink, useLocation } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { logo } from "../assets/images";
import sakura from "../assets/sakura.mp3";

const Navbar = () => {
  const { pathname } = useLocation();
  const isDark = ['/lab', '/learn', '/creative', '/chess', '/science', '/face', '/vision', '/explore', '/ai', '/studio', '/ai-studio', '/ai-video', '/video', '/image-enhancer', '/enhance', '/hand', '/hands', '/draw', '/lipsync', '/audio', '/cinema', '/about', '/projects', '/contact'].some(r => pathname.startsWith(r));

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

  // Featured pills — slimmed down to the 4 flagship AI lanes. The
  // long bar with every studio was overflowing on lg viewports; the
  // rest live in the More dropdown grouped by category.
  const featuredPills = [
    { to: '/ai-video',       label: 'AI Video',     color: 'from-cyan-500 via-purple-500 to-amber-500' },
    { to: '/image-enhancer', label: 'Image Studio', color: 'from-cyan-300 via-fuchsia-400 to-amber-300' },
    { to: '/3d',             label: '3D',           color: 'from-violet-400 via-fuchsia-400 to-cyan-400' },
    { to: '/ai',             label: 'AI Chat',      color: 'from-blue-500 to-cyan-500' },
  ];

  // Mega-menu groups — AI lanes kept together, Play (non-AI demos)
  // kept separate. Science / Explore (NASA + public APIs) removed
  // from the nav per user request — routes still exist for any
  // direct deep links but they're hidden from discovery.
  const moreGroups = [
    {
      title: 'AI Studios',
      accent: 'text-violet-300',
      items: [
        // Image Studio now hosts Vision AI + Fast Image Gen as tabs (the
        // old standalone /vision and /ai-studio pages are sunset).
        { to: '/image-enhancer', label: 'Image Studio', desc: 'Enhance · Fast gen · Vision · T2I' },
        // Audio Studio now hosts Lip Sync as a tab too.
        { to: '/audio',          label: 'Audio Studio', desc: 'Music · TTS · STT · Voice clone · Lip sync' },
        { to: '/hand',           label: 'Hand Tracking', desc: '50 filters · 2-hand draw · cursor · laser' },
      ],
    },
    {
      // 'Engineered' replaces 'Play' — both items here are full ground-up
      // builds (chess engine + 3D runner), not casual demos. Chess goes
      // first because it's the deeper engineering build.
      title: 'Engineered',
      accent: 'text-cyan-300',
      items: [
        { to: '/chess',      label: '♛ Chess Engine',  desc: 'Stockfish · clocks · saved games · piece themes' },
        { to: '/runner',     label: '🏃 Hand Runner',   desc: 'Three.js · MediaPipe · ramps · oncoming trains' },
      ],
    },
    {
      title: 'Others',
      accent: 'text-emerald-300',
      items: [
        { to: '/lab',        label: 'Interactive Lab',  desc: '17 mini-demos · 7 categories' },
        { to: '/creative',   label: 'Creative UI',      desc: '13 UI experiments' },
        { to: '/learn',      label: 'Learn DSA',        desc: 'Algorithms · system design · CP' },
        { to: '/science',    label: '🛰 Explore Space', desc: '11 NASA modules · APOD · Mars · Asteroids' },
        { to: '/explore',    label: '🌐 Web Playground', desc: '9 APIs · Pokémon · Memes · Countries · Quotes' },
        { to: '/summarizer', label: '✂ Summarizer',    desc: 'Paste long text · get a tight summary' },
      ],
    },
  ];

  return (
    <header className={`header transition-colors ${isDark ? 'bg-gray-950/80 backdrop-blur-md' : ''}`}>
      <NavLink to='/' className="shrink-0">
        <img src={logo} alt='logo' className='w-12 h-12 sm:w-14 sm:h-14 object-contain' />
      </NavLink>

      {/* Desktop nav.
          7 studio pills + 3 primary links + More + Resume is tight at 1024px,
          so the pills shrink to text-[10px] / px-2 / py-1 below xl, then expand
          back at xl. flex-wrap is the safety net — if a future addition pushes
          past the budget, items wrap to a second row instead of clipping. */}
      <nav className='hidden lg:flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium max-w-[calc(100%-200px)]'>
        {/* Primary links — animated underline on hover/active */}
        {primaryLinks.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `group relative text-[12px] xl:text-sm px-1.5 xl:px-2 py-1 transition-colors ${
              isActive
                ? 'text-violet-300'
                : isDark ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-black'
            }`}>
            {({ isActive }) => (
              <>
                <span>{l.label}</span>
                <span className={`absolute left-1.5 right-1.5 -bottom-0.5 h-px bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 transition-transform origin-left ${
                  isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                }`} />
              </>
            )}
          </NavLink>
        ))}

        <div className={`w-px h-4 mx-0.5 xl:mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

        {/* Featured pills — shrink on lg, normal on xl */}
        {featuredPills.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `text-[10px] xl:text-[11px] px-2 xl:px-2.5 py-1 xl:py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap ${
              isActive
                ? `text-white bg-gradient-to-r ${l.color} shadow-md`
                : isDark
                  ? 'text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700'
                  : 'text-gray-600 hover:text-black bg-gray-100 hover:bg-gray-200'
            }`}>
            {l.label}
          </NavLink>
        ))}

        {/* Mega-menu — AI Studios + Play, grouped */}
        <div className="relative">
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`group text-[10px] xl:text-[11px] px-2 xl:px-2.5 py-1 xl:py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 whitespace-nowrap border ${
              moreOpen
                ? 'text-white bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border-violet-400/40 shadow-md'
                : isDark
                  ? 'text-gray-300 hover:text-white bg-gray-800/60 border-gray-700 hover:border-violet-400/40 hover:bg-gray-800'
                  : 'text-gray-600 hover:text-black bg-gray-100 border-gray-200 hover:bg-gray-200'
            }`}>
            More
            <svg className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : 'group-hover:translate-y-0.5'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} />
              <div className={`absolute top-full right-0 mt-2 rounded-2xl shadow-2xl border z-50 overflow-hidden
                              w-[560px] max-w-[92vw] grid grid-cols-1 sm:grid-cols-2
                              ${isDark
                                ? 'bg-[#0a0a0e] border-gray-800'
                                : 'bg-white border-gray-200'}`}>
                {moreGroups.map((g, gi) => (
                  <div key={g.title} className={`p-4 ${gi === 0 ? 'sm:border-r' : ''} ${isDark ? 'sm:border-gray-800' : 'sm:border-gray-200'}`}>
                    <p className={`text-[10px] uppercase tracking-[0.18em] font-bold mb-3 ${g.accent}`}>
                      {g.title}
                    </p>
                    <ul className="space-y-1">
                      {g.items.map(it => (
                        <li key={it.to}>
                          <NavLink to={it.to} onClick={() => setMoreOpen(false)}
                            className={({ isActive }) =>
                              `group flex flex-col px-3 py-2 rounded-lg transition-all ${
                                isActive
                                  ? (isDark ? 'bg-white/[0.06] ring-1 ring-violet-400/40' : 'bg-violet-50 ring-1 ring-violet-200')
                                  : (isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50')
                              }`}>
                            {({ isActive }) => (
                              <>
                                <span className={`text-sm font-semibold transition-colors ${
                                  isActive
                                    ? (isDark ? 'text-white' : 'text-black')
                                    : (isDark ? 'text-gray-100 group-hover:text-white' : 'text-gray-900')
                                }`}>
                                  {it.label}
                                </span>
                                <span className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-500'}`}>
                                  {it.desc}
                                </span>
                              </>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`w-px h-4 mx-0.5 xl:mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

        <a href="/resume.pdf" target="_blank" rel="noreferrer"
          className="text-[10px] xl:text-[11px] px-2 xl:px-3 py-1 xl:py-1.5 rounded-lg text-white font-semibold whitespace-nowrap
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

          {/* AI Studios + Play groups */}
          {moreGroups.map(g => (
            <div key={g.title}>
              <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 pt-3 pb-1 ${g.accent}`}>
                {g.title}
              </div>
              {g.items.map(it => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) =>
                  `flex flex-col py-2.5 px-2 rounded-lg ${isActive
                    ? 'text-violet-300 bg-violet-500/10'
                    : isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                  <span className="text-sm font-medium">{it.label}</span>
                  <span className="text-[11px] text-gray-500">{it.desc}</span>
                </NavLink>
              ))}
            </div>
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
