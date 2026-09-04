import { NavLink, useLocation } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LockOutlined, UnlockOutlined, BulbOutlined, BulbFilled } from "@ant-design/icons";
import sakura from "../assets/sakura.mp3";
import { useVault } from "../contexts/VaultContext";
import { useTheme } from "../hooks/useTheme";

// New SF crimson logo lives under public/ — referenced by absolute
// path so Vite serves it directly and we avoid bundling a 2 MB PNG.
const LOGO_SRC = "/logo-sf.png";

const Navbar = () => {
  const { pathname } = useLocation();
  // Home (`/`) is now a dark cinematic hero too, so it joins the
  // dark-mode list — otherwise the primary nav links + Workshop
  // button render with `text-gray-700` (light-mode style) and
  // disappear against the obsidian backdrop. We match `/` exactly
  // because `pathname.startsWith('/')` would be true for everything.
  const isDark = pathname === '/' || ['/lab', '/learn', '/creative', '/chess', '/science', '/face', '/vision', '/explore', '/ai', '/studio', '/ai-studio', '/ai-video', '/video', '/image-enhancer', '/enhance', '/hand', '/hands', '/draw', '/lipsync', '/audio', '/cinema', '/about', '/projects', '/contact'].some(r => pathname.startsWith(r));

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const a = new Audio(sakura);
    a.volume = 0.4;
    a.loop = true;
    audioRef.current = a;
    return () => { a.pause(); a.src = ''; };
  }, []);

  // Close BOTH the Workshop dropdown AND mobile menu on route change.
  // Without resetting moreOpen here, clicking a NavLink inside the
  // dropdown leaves moreOpen=true on the next route → body keeps the
  // workshop-open lock → scrollbar drops → page content shifts right
  // by ~15px because `mx-auto` re-centers against the now-wider
  // viewport.
  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const [moreOpen, setMoreOpen] = useState(false);

  // While the Workshop dropdown OR the mobile menu is open, lock the
  // body so the homepage cinematic-scroll-jack doesn't advance the
  // video frames when the user is scrolling inside the dropdown.
  // The `workshop-open` class is read by ScrollCinematicHero's wheel
  // handler to bail out and let the dropdown scroll its own content.
  useEffect(() => {
    const anyOpen = moreOpen || menuOpen;
    if (anyOpen) {
      document.body.classList.add("workshop-open");
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("workshop-open");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("workshop-open");
      document.body.style.overflow = "";
    };
  }, [moreOpen, menuOpen]);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(p => !p);
  };

  // Primary nav — always visible
  const primaryLinks = [
    { to: '/about', label: 'About' },
    { to: '/projects', label: 'Projects' },
    { to: '/contact', label: 'Contact' },
  ];

  // Featured pills were removed from the desktop bar per user request —
  // every tool now lives inside the More dropdown only. Resume stays
  // outside (golden) because it's the most-clicked link.
  const featuredPills = [];

  // Mega-menu groups — every tool lives here now. Sections mirror the
  // home-page card grid so users see the same layout in both places.
  const moreGroups = [
    {
      title: 'AI Studios',
      accent: 'text-amber-300',
      items: [
        { to: '/ai-video',       label: 'AI Video Studio', desc: 'T2V · I2V · ZSky / LTX / Wan / Hunyuan' },
        { to: '/image-enhancer', label: 'Image Studio',    desc: 'Enhance · Fast Gen · T2I · Vision' },
        { to: '/audio',          label: 'Audio Studio',    desc: 'Music · TTS · STT · Voice clone · Lip sync' },
        { to: '/ai',             label: 'AI Chat',         desc: 'Groq · Beast (Ollama 5090) · multimodal' },
        { to: '/3d',             label: '3D Studio',       desc: 'Generate · Studio Pro · Library · Visualize' },
        { to: '/cinema',         label: 'Cinema',          desc: 'Multi-shot AI cinema with planner + queue' },
        { to: '/showreel',       label: 'Showreel',        desc: 'Cinematic chapter reel of the AI stack' },
        { to: '/splat',          label: 'Splat Viewer',    desc: 'Walk through any Gaussian splat scene' },
        { to: '/room',           label: 'Room Designer',   desc: 'Video → analysis → furniture → MP4 · V1' },
        { to: '/edit',           label: 'Video Editor',    desc: 'Simple · drop · trim · crop · music · save' },
        { to: '/edit/advanced',  label: 'Timeline Editor', desc: 'Multi-track · keyframes · color · effects' },
        { to: '/edit/library',   label: 'My Edits',        desc: 'Saved exported videos · library + bulk delete' },
        { to: '/realism',        label: 'Realism Lab',     desc: 'Sandbox · cinematic prompt + I2V pipeline' },
        { to: '/hand',           label: 'Hand Tracking',   desc: '50 filters · 2-hand draw · cursor · laser' },
      ],
    },
    {
      title: 'Engineered',
      accent: 'text-cyan-300',
      items: [
        { to: '/chess',       label: 'Chess Engine',  desc: 'Stockfish · clocks · saved games · piece themes' },
        { to: '/simple-game', label: 'Simple Games',  desc: 'Snake · code + live game · pause · step through' },
      ],
    },
    {
      title: 'Hand Gesture',
      accent: 'text-fuchsia-300',
      items: [
        { to: '/runner',         label: 'Hand Runner',   desc: 'Three.js runner · lane by hand, jump by palm' },
        { to: '/hand',           label: 'Hand Tracking', desc: '50 filters · 2-hand draw · cursor · laser' },
        { to: '/gesture-memes',  label: 'Gesture Memes', desc: '11 gestures → cat memes · MediaPipe in-browser' },
        { to: '/gesture-hammy',  label: 'Hammy Hamster', desc: '15 face + hand + pose gestures → hamster memes' },
      ],
    },
    {
      title: 'Others',
      accent: 'text-emerald-300',
      items: [
        { to: '/lab',        label: 'Interactive Lab',  desc: '17 mini-demos · 7 categories' },
        { to: '/creative',   label: 'Creative UI',      desc: '13 UI experiments' },
        { to: '/learn',      label: 'Learn DSA',        desc: 'Algorithms · system design · CP' },
        { to: '/science',    label: 'Explore Space',    desc: '11 NASA modules · APOD · Mars · Asteroids' },
        { to: '/explore',    label: 'Web Playground',   desc: '9 APIs · Pokémon · Memes · Countries · Quotes' },
        { to: '/summarizer', label: 'Summarizer',       desc: 'Paste long text · get a tight summary' },
        { to: '/yt-dl',      label: 'YouTube DL',       desc: 'Paste a YouTube link · get MP3 or MP4' },
      ],
    },
    {
      // Vault-gated lanes — every link here passes through <VaultGate>
      // which prompts for the password on first visit, then keeps a JWT
      // in localStorage (`sid-vault-token`) until expiry so subsequent
      // clicks bypass the modal.
      title: 'Vault',
      accent: 'text-fuchsia-300',
      vault: true,
      items: [
        { to: '/deepfake', label: 'Deepfake Studio', desc: 'Face-swap · voice-clone · Vault password required', vault: true },
        { to: '/settings', label: 'Settings',        desc: "Admin · Sid's monitoring panel · server / DB / queues", vault: true },
      ],
    },
  ];

  return (
    <header className={`header transition-colors ${isDark ? 'bg-gray-950/80 backdrop-blur-md' : ''}`}>
      <NavLink to='/' className="shrink-0 group">
        <img
          src={LOGO_SRC}
          alt='Siddharth Fulia logo'
          className='w-16 h-16 sm:w-20 sm:h-20 object-contain
                     drop-shadow-[0_0_22px_rgba(239,68,68,0.85)]
                     [filter:drop-shadow(0_0_4px_rgba(239,68,68,0.95))_drop-shadow(0_0_18px_rgba(239,68,68,0.6))_contrast(1.15)_saturate(1.25)_brightness(1.08)]
                     transition-transform duration-300 group-hover:scale-105'
        />
      </NavLink>

      {/* Desktop nav.
          7 studio pills + 3 primary links + More + Resume is tight at 1024px,
          so the pills shrink to text-[10px] / px-2 / py-1 below xl, then expand
          back at xl. flex-wrap is the safety net — if a future addition pushes
          past the budget, items wrap to a second row instead of clipping. */}
      <nav className='hidden lg:flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium max-w-[calc(100%-200px)]'>
        {/* Primary links — bigger + bolder so About / Projects /
            Contact pull the eye against the cinematic backdrop. */}
        {primaryLinks.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `group relative text-sm xl:text-[15px] font-semibold px-2.5 xl:px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? (isDark ? 'text-amber-300 bg-amber-500/10' : 'text-amber-600 bg-amber-50')
                : isDark ? 'text-white hover:text-amber-200 hover:bg-white/[0.06]' : 'text-gray-800 hover:text-black hover:bg-gray-100'
            }`}>
            {({ isActive }) => (
              <>
                <span>{l.label}</span>
                <span className={`absolute left-2.5 right-2.5 -bottom-0.5 h-px bg-amber-400 transition-transform origin-left ${
                  isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                }`} />
              </>
            )}
          </NavLink>
        ))}

        <div className={`w-px h-4 mx-0.5 xl:mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

        <button
          onClick={toggleTheme}
          aria-label='Toggle theme'
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          className={`text-[13px] w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isDark
              ? 'text-gray-300 hover:text-amber-200 hover:bg-white/[0.06]'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
          }`}>
          {theme === 'light' ? <BulbFilled /> : <BulbOutlined />}
        </button>

        {/* Mega-menu — every tool lives here now (no inline pills) */}
        <div className="relative">
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`group text-[10px] xl:text-[11px] px-2 xl:px-2.5 py-1 xl:py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 whitespace-nowrap border ${
              moreOpen
                ? 'text-white bg-amber-500/15 border-amber-400/40'
                : isDark
                  ? 'text-gray-300 hover:text-white bg-gray-800/60 border-gray-700 hover:border-amber-400/40 hover:bg-gray-800'
                  : 'text-gray-600 hover:text-black bg-gray-100 border-gray-200 hover:bg-gray-200'
            }`}>
            The Playground
            <svg className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : 'group-hover:translate-y-0.5'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} />
              <div
                data-workshop-dropdown
                className={`absolute top-full right-0 mt-2 rounded-2xl shadow-2xl border z-50 overflow-hidden
                              w-[720px] max-w-[94vw]
                              ${isDark
                                ? 'bg-[#0a0a0e] border-gray-800'
                                : 'bg-white border-gray-200'}`}>
                {/* Vault control — top of the dropdown so it's one click
                    away from anywhere on the site. Shows current state. */}
                <VaultDropdownEntry isDark={isDark} onAction={() => setMoreOpen(false)} />
                <div className="grid grid-cols-1 sm:grid-cols-2">
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
                                  ? (isDark ? 'bg-white/[0.06] ring-1 ring-amber-400/40' : 'bg-amber-50 ring-1 ring-amber-200')
                                  : (isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50')
                              }`}>
                            {({ isActive }) => (
                              <>
                                <span className={`text-sm font-semibold transition-colors inline-flex items-center gap-1.5 ${
                                  isActive
                                    ? (isDark ? 'text-white' : 'text-black')
                                    : (isDark ? 'text-gray-100 group-hover:text-white' : 'text-gray-900')
                                }`}>
                                  {it.label}
                                  {it.vault && (
                                    <LockOutlined
                                      className="text-[10px] text-fuchsia-400"
                                      title="Vault password required" />
                                  )}
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
              </div>
            </>
          )}
        </div>

        <div className={`w-px h-4 mx-0.5 xl:mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

        <a href="/resume.pdf" target="_blank" rel="noreferrer"
          className="text-[10px] xl:text-[11px] px-2 xl:px-3 py-1 xl:py-1.5 rounded-lg text-black font-semibold whitespace-nowrap
                     bg-amber-400 hover:bg-amber-300 transition-colors">
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

      {/* Mobile menu backdrop — closes menu on outside tap. Fades in/out
          on the same Framer Motion timing as the panel so neither pops. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 top-16 z-40 bg-black/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile menu — slides down from the top with a subtle ease + fades
          out on close. Replaces the previous mount-on / unmount-off jump. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`absolute top-full left-0 right-0 z-50 py-4 px-6 flex flex-col gap-1 shadow-xl border-t
              ${isDark ? 'bg-gray-950/95 border-gray-800' : 'bg-white/95 border-gray-200'}`}>

          {/* Vault control — same as the desktop dropdown entry */}
          <div className="px-2 pt-2">
            <VaultDropdownEntry isDark={isDark} onAction={() => setMenuOpen(false)} />
          </div>

          {/* Main pages — the only "always visible" links now */}
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
                    ? 'text-amber-300 bg-amber-500/10'
                    : isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                  <span className="text-sm font-medium inline-flex items-center gap-1.5">
                    {it.label}
                    {it.vault && (
                      <LockOutlined className="text-[10px] text-fuchsia-400"
                        title="Vault password required" />
                    )}
                  </span>
                  <span className="text-[11px] text-gray-500">{it.desc}</span>
                </NavLink>
              ))}
            </div>
          ))}

          <div className="flex items-center gap-2 mt-3">
            <a href="/resume.pdf" target="_blank" rel="noreferrer"
              className="flex-1 text-sm px-4 py-2.5 rounded-lg text-black font-semibold text-center
                         bg-amber-400 hover:bg-amber-300">
              Resume
            </a>
            <button
              onClick={toggleTheme}
              aria-label='Toggle theme'
              className={`w-11 h-11 rounded-lg flex items-center justify-center border ${
                isDark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-700'
              }`}>
              {theme === 'light' ? <BulbFilled /> : <BulbOutlined />}
            </button>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

const MusicBtn = ({ playing, toggleMusic, isDark }) => (
  <button onClick={toggleMusic}
    className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
      playing
        ? isDark ? 'bg-cyan-500/20 text-cyan-400'
                 : 'bg-blue-100 text-blue-600'
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

// Vault state entry rendered at the TOP of the Workshop dropdown.
// Shows current lock state + a one-click login/logout button.
// Reads from the global VaultContext so every other component reflects
// the change without needing its own modal.
const VaultDropdownEntry = ({ isDark, onAction }) => {
  const { isUnlocked, openLoginModal, logout } = useVault();
  return (
    <div className={`px-4 py-3 ${isDark ? 'border-b border-gray-800 bg-gradient-to-r from-fuchsia-500/5 to-transparent' : 'border-b border-gray-200 bg-gradient-to-r from-fuchsia-50 to-transparent'}`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex w-9 h-9 rounded-xl items-center justify-center text-base ${
          isUnlocked
            ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40 text-emerald-300'
            : 'bg-fuchsia-500/15 ring-1 ring-fuchsia-400/40 text-fuchsia-300'
        }`}>
          {isUnlocked ? <UnlockOutlined /> : <LockOutlined />}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Vault {isUnlocked ? 'unlocked' : 'locked'}
          </p>
          <p className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            {isUnlocked
              ? 'Editing, deletes & private items visible'
              : 'Log in for editing, deletes & private items'}
          </p>
        </div>
        <button
          onClick={() => {
            if (isUnlocked) logout();
            else openLoginModal();
            onAction?.();
          }}
          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
            isUnlocked
              ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 ring-1 ring-emerald-400/40'
              : 'bg-fuchsia-500 text-white hover:bg-fuchsia-400'
          }`}
        >
          {isUnlocked ? 'Log out' : 'Unlock'}
        </button>
      </div>
    </div>
  );
};

export default Navbar;
