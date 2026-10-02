import { useState } from 'react';
import { navigate } from '../hooks/useRoute';
import { ThemeToggle } from './ThemeToggle';
import { BrandLogo } from './BrandLogo';
import { isPro } from '../lib/license';
import { HIDE_EDITOR, HIDE_PRO } from '../config/build';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  /** Constrains the header to match the page's content width. */
  maxWidth?: string;
  /** Show the primary nav. Off for focused pages like legal docs. */
  showNav?: boolean;
}

/** Top-bar navigation links (the SEO content pages + pricing). */
const NAV_LINKS = [
  { label: 'Video Editor', path: '/video-editor' },
  { label: 'How-To', path: '/how-to-download-videos' },
  { label: 'YouTube', path: '/download-youtube-videos' },
  { label: 'Facebook', path: '/download-facebook-videos' },
  { label: 'Instagram', path: '/download-instagram-videos' },
  { label: 'Pricing', path: '/pricing' },
];

/** Extra links shown only in the mobile drawer. */
const MOBILE_EXTRA = [
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

/** Shared top bar used by every page: brand, nav (desktop inline / mobile drawer), theme. */
export function SiteHeader({ theme, onToggleTheme, maxWidth = 'max-w-5xl', showNav = true }: Props) {
  const pro = isPro();
  const [open, setOpen] = useState(false);
  // iOS build (HIDE_PRO): no pricing/paid surfaces.
  const navLinks = NAV_LINKS.filter(
    (l) => !(HIDE_PRO && l.path === '/pricing') && !(HIDE_EDITOR && l.path === '/video-editor'),
  );
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header className={`relative z-30 mx-auto ${maxWidth} px-5`}>
      <div className="flex items-center justify-between py-5 sm:py-6">
        <BrandLogo />

        {/* Desktop nav */}
        {showNav && (
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((l) => (
              <button
                key={l.path}
                onClick={() => navigate(l.path)}
                className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
              >
                {l.label}
              </button>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-1.5 sm:gap-3">
          {HIDE_PRO ? null : pro ? (
            <button
              onClick={() => navigate('/pricing')}
              className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-amber-500" fill="currentColor" aria-hidden="true">
                <path d="m12 2 2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6L12 2Z" />
              </svg>
              Account
            </button>
          ) : (
            showNav && (
              <button
                onClick={() => navigate('/pricing')}
                className="btn-gradient hidden rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-glow-soft md:inline-flex"
              >
                Go Pro
              </button>
            )
          )}

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          {/* Mobile hamburger */}
          {showNav && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100 md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      {showNav && open && (
        <div className="absolute inset-x-3 top-full z-40 origin-top rounded-2xl border border-slate-200 bg-white p-2 shadow-card md:hidden">
          {[...(HIDE_PRO ? [{ label: 'Home', path: '/' }] : []), ...navLinks, ...MOBILE_EXTRA].map((l) => (
            <button
              key={l.path}
              onClick={() => go(l.path)}
              className="block w-full rounded-xl px-4 py-3 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
