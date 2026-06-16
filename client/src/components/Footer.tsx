import { navigate } from '../hooks/useRoute';
import { LEGAL_LINKS } from '../pages/LegalPages';
import { COMPANY } from '../config/company';

/** Smooth-scrolls to a landing section, navigating home first if needed. */
function goToSection(id: string) {
  if (window.location.pathname !== '/') {
    navigate('/');
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  } else {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function FootLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-white/55 transition hover:text-white">
      {children}
    </button>
  );
}

/** Multi-column site footer with brand, product, legal, and support columns. */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06]">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <button onClick={() => navigate('/')} className="flex items-center gap-2.5" aria-label="ClipVault — home">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-gradient shadow-glow-soft">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7L8 5Z" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight text-white">ClipVault</span>
            </button>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
              The fastest, cleanest way to download videos from YouTube, Facebook, and Instagram —
              in HD, 2K, and 4K, always with sound.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Product</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              <FootLink onClick={() => goToSection('how-it-works')}>How it works</FootLink>
              <FootLink onClick={() => goToSection('features')}>Features</FootLink>
              <FootLink onClick={() => navigate('/pricing')}>Pricing</FootLink>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Legal</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              {LEGAL_LINKS.map((l) => (
                <FootLink key={l.path} onClick={() => navigate(l.path)}>
                  {l.label}
                </FootLink>
              ))}
            </div>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Support</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              <a href={`mailto:${COMPANY.contactEmail}`} className="text-sm text-white/55 transition hover:text-white">
                Contact us
              </a>
              <a href={`mailto:${COMPANY.dmcaEmail}`} className="text-sm text-white/55 transition hover:text-white">
                Copyright / DMCA
              </a>
            </div>
          </div>
        </div>

        {/* Responsible-use disclaimer */}
        <div className="mt-10 rounded-2xl bg-white/[0.03] p-5 text-xs leading-relaxed text-white/50">
          <p className="mb-1.5 font-medium text-white/70">⚖️ Please download responsibly</p>
          <p>
            Only download content you own or have the rights to. By using ClipVault you agree to respect each
            platform's Terms of Service and all applicable copyright laws. This tool is provided for personal,
            lawful use only. ClipVault is not affiliated with YouTube, Meta, Facebook, or Instagram.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-white/45 sm:text-left">
          © {new Date().getFullYear()} ClipVault · Built with yt-dlp &amp; ffmpeg
        </p>
      </div>
    </footer>
  );
}
