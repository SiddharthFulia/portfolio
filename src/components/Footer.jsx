import { Link, useLocation } from "react-router-dom";
import { socialLinks } from "../constants";

// Dark-route list mirrors Navbar's. Pages in this list opt the footer
// into dark theming so the transition between page content and footer
// reads as one continuous surface.
const DARK_ROUTES = ['/lab', '/learn', '/creative', '/chess', '/science', '/face', '/vision', '/explore', '/ai', '/studio', '/ai-video', '/image-enhancer', '/audio', '/deepfake', '/yt-dl', '/youtube', '/cinema', '/lipsync', '/runner', '/game', '/3d', '/settings', '/summarizer'];

// Footer columns — kept short. The site's not a SaaS dashboard so
// nobody is hunting for legal links; the goal is to make the bottom of
// the page feel intentional rather than a single copyright line.
const COL_TOOLS = [
  { to: '/ai-video',       label: 'AI Video' },
  { to: '/image-enhancer', label: 'Image Studio' },
  { to: '/audio',          label: 'Audio Studio' },
  { to: '/chess',          label: 'Chess Engine' },
  { to: '/runner',         label: 'Hand Runner' },
  { to: '/yt-dl',          label: 'YouTube DL' },
];
const COL_EXPLORE = [
  { to: '/about',     label: 'About' },
  { to: '/projects',  label: 'Projects' },
  { to: '/contact',   label: 'Contact' },
  { to: '/lab',       label: 'Lab' },
  { to: '/creative',  label: 'Creative' },
  { to: '/learn',     label: 'Learn' },
];

const Footer = () => {
  const { pathname } = useLocation();
  const isDark = DARK_ROUTES.some(r => pathname.startsWith(r));
  const year = new Date().getFullYear();

  // Light-theme footer — kept for /, /about, /projects, /contact paths
  // that still render on a white background. Same content as the dark
  // version, just inverted colours.
  if (!isDark) {
    return (
      <footer className='font-poppins'>
        <div className='max-w-5xl mx-auto sm:px-16 pb-6 px-8 flex flex-col gap-7'>
          <hr className='border-slate-200' />
          <div className='flex flex-wrap gap-7 items-center justify-between'>
            <p className='text-slate-600'>
              © {year} <strong className='text-slate-900'>Siddharth Fulia</strong> — built solo, no template.
            </p>
            <div className='flex gap-3 justify-center items-center'>
              {socialLinks.map((link) => (
                <Link key={link.name} to={link.link} target='_blank' rel='noopener'>
                  <img src={link.iconUrl} alt={link.name} className='w-6 h-6 object-contain' />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // Dark-theme footer — three-column layout on desktop, stacked on
  // mobile. The bio column on the left, two link columns on the right.
  // The thin gradient hairline at the top echoes the section dividers
  // used elsewhere; the body sits on bg-surface-base so the eye reads
  // the page → footer transition as one continuous dark surface.
  return (
    <footer className='font-poppins bg-surface-base text-fg-secondary border-t border-line/60'>
      <div className='max-w-6xl mx-auto px-6 sm:px-10 py-12'>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10'>

          {/* ── Bio column ── */}
          <div>
            <Link to='/' className='inline-block mb-3'>
              <span className='text-lg font-bold text-amber-300'>Siddharth Fulia</span>
            </Link>
            <p className='text-sm text-fg-muted leading-relaxed max-w-xs'>
              Engineer + designer. Builds AI tools, chess engines, 3D toys, and the occasional Subway-Surfers clone.
            </p>
            <div className='mt-4 flex gap-3 items-center'>
              {socialLinks.map((link) => (
                <Link key={link.name} to={link.link} target='_blank' rel='noopener'
                  className='opacity-60 hover:opacity-100 transition-opacity'>
                  <img src={link.iconUrl} alt={link.name} className='w-5 h-5 object-contain' />
                </Link>
              ))}
            </div>
          </div>

          {/* ── Tools column ── */}
          <div>
            <h4 className='eyebrow-mono mb-3'>Tools</h4>
            <ul className='space-y-2'>
              {COL_TOOLS.map(item => (
                <li key={item.to}>
                  <Link to={item.to}
                    className='text-sm text-fg-secondary hover:text-fg-primary transition-colors'>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Explore column ── */}
          <div>
            <h4 className='eyebrow-mono mb-3'>Explore</h4>
            <ul className='space-y-2'>
              {COL_EXPLORE.map(item => (
                <li key={item.to}>
                  <Link to={item.to}
                    className='text-sm text-fg-secondary hover:text-fg-primary transition-colors'>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom strip ── */}
        <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6 border-t border-line/60'>
          <p className='text-xs text-fg-muted'>
            © {year} Siddharth Fulia — built solo, no template, no AI-generated copy.
          </p>
          <p className='text-[10px] font-mono text-fg-muted/60 uppercase tracking-wider'>
            v2.0 · React · Vite · Tailwind · antd
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
