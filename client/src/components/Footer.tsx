import { navigate } from '../hooks/useRoute';
import { LEGAL_LINKS } from '../pages/LegalPages';
import { CONTENT_ROUTES } from '../pages/ContentPages';
import { COMPANY } from '../config/company';
import { BrandLogo } from './BrandLogo';

const GUIDE_LINKS = [
  { path: '/how-to-download-videos', label: 'How to download' },
  { path: '/download-youtube-videos', label: 'YouTube downloader' },
  { path: '/download-facebook-videos', label: 'Facebook downloader' },
  { path: '/download-instagram-videos', label: 'Instagram downloader' },
] satisfies ReadonlyArray<{ path: keyof typeof CONTENT_ROUTES & string; label: string }>;

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
    <button
      onClick={onClick}
      className="block w-full text-left text-sm text-slate-500 transition hover:text-slate-900 sm:whitespace-nowrap"
    >
      {children}
    </button>
  );
}

/** Multi-column site footer with brand, product, legal, and support columns. */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-slate-200">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.15fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <BrandLogo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              The fastest, cleanest way to download videos from YouTube, Facebook, and Instagram —
              in HD, 2K, and 4K, always with sound.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Product</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              <FootLink onClick={() => goToSection('how-it-works')}>How it works</FootLink>
              <FootLink onClick={() => goToSection('features')}>Features</FootLink>
              <FootLink onClick={() => navigate('/pricing')}>Pricing</FootLink>
            </div>
          </div>

          {/* Guides */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Guides</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              {GUIDE_LINKS.map((l) => (
                <FootLink key={l.path} onClick={() => navigate(l.path)}>
                  {l.label}
                </FootLink>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Company</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              <FootLink onClick={() => navigate('/about')}>About</FootLink>
              <FootLink onClick={() => navigate('/contact')}>Contact</FootLink>
              {LEGAL_LINKS.map((l) => (
                <FootLink key={l.path} onClick={() => navigate(l.path)}>
                  {l.label}
                </FootLink>
              ))}
            </div>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Support</h3>
            <div className="mt-4 flex flex-col items-start gap-2.5">
              <a
                href={`mailto:${COMPANY.contactEmail}`}
                className="block w-full text-left text-sm text-slate-500 transition hover:text-slate-900"
              >
                Email support
              </a>
              <a
                href={`mailto:${COMPANY.dmcaEmail}`}
                className="block w-full text-left text-sm text-slate-500 transition hover:text-slate-900"
              >
                Copyright / DMCA
              </a>
            </div>
          </div>
        </div>

        {/* Responsible-use disclaimer */}
        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs leading-relaxed text-slate-500">
          <p className="mb-1.5 font-medium text-slate-700">⚖️ Please download responsibly</p>
          <p>
            Only download content you own or have the rights to. By using {COMPANY.brand} you agree to respect each
            platform's Terms of Service and all applicable copyright laws. This tool is provided for personal,
            lawful use only. {COMPANY.brand} is not affiliated with YouTube, Meta, Facebook, or Instagram.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 sm:text-left">
          © {new Date().getFullYear()} {COMPANY.brand} · Built with yt-dlp &amp; ffmpeg
        </p>
      </div>
    </footer>
  );
}
