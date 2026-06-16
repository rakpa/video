import { navigate } from '../hooks/useRoute';
import { ThemeToggle } from './ThemeToggle';
import { isPro } from '../lib/license';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  /** Constrains the header to match the page's content width. */
  maxWidth?: string;
  /** Show the primary nav (Pricing). Off for focused pages like legal docs. */
  showNav?: boolean;
}

/** Brand mark — always links home. */
function Logo() {
  return (
    <button onClick={() => navigate('/')} className="flex items-center gap-2.5" aria-label="ClipVault — home">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-gradient shadow-glow-soft">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
      </div>
      <span className="text-lg font-bold tracking-tight">ClipVault</span>
    </button>
  );
}

/**
 * Shared top bar used by every page. Previously the logo + brand markup was
 * duplicated three times with drifting max-widths and an unclickable logo on
 * the main app. One component keeps the header identical everywhere.
 */
export function SiteHeader({ theme, onToggleTheme, maxWidth = 'max-w-5xl', showNav = true }: Props) {
  const pro = isPro();
  return (
    <header className={`mx-auto flex ${maxWidth} items-center justify-between px-5 py-6`}>
      <Logo />

      <div className="flex items-center gap-2 sm:gap-4">
        {pro ? (
          // Pro users get a direct account entry point instead of a Pricing CTA.
          <button
            onClick={() => navigate('/pricing')}
            className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-amber-300" fill="currentColor" aria-hidden="true">
              <path d="m12 2 2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6L12 2Z" />
            </svg>
            Account
          </button>
        ) : (
          showNav && (
            <>
              <nav className="hidden items-center sm:flex">
                <button
                  onClick={() => navigate('/pricing')}
                  className="font-medium text-white/80 transition hover:text-white"
                >
                  Pricing
                </button>
              </nav>
              <button
                onClick={() => navigate('/pricing')}
                className="btn-gradient rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-glow-soft sm:hidden"
              >
                Pricing
              </button>
            </>
          )
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}
