import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../content/site';

interface Props {
  children: ReactNode;
}

/** Shared Stitch-themed nav + footer shell for app pages outside the home HTML. */
export function StitchShell({ children }: Props) {
  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md">
      <nav className="sticky top-0 z-50 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-20">
          <Link to="/" className="flex items-center gap-2 group no-underline">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                cloud_download
              </span>
            </div>
            <span className="font-title-lg text-title-lg font-black text-primary tracking-tight">{site.brand}</span>
          </Link>
          <div className="hidden md:flex items-center gap-gutter">
            {site.navLinks.map((l) => (
              <Link
                key={l.route}
                to={l.route}
                className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 no-underline"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <Link
            to="/"
            className="bg-primary text-on-primary font-label-md text-label-md px-6 py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all no-underline"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <main className="flex-grow">{children}</main>

      <footer className="bg-surface-container-low border-t border-outline-variant/20 w-full mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto gap-stack-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              cloud_download
            </span>
            <span className="font-title-lg text-title-lg font-black text-on-surface">{site.brand}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            {site.footerLinks.map((l) => (
              <Link
                key={l.route}
                to={l.route}
                className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors no-underline"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="font-body-md text-body-md text-outline text-sm">
            © {site.year} {site.brand}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
