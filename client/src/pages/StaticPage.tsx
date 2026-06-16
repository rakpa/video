import { useState } from 'react';
import { Link } from 'react-router-dom';
import { staticPages } from '../content/staticPages';
import { site } from '../content/site';

interface Props {
  path: string;
  showContactForm?: boolean;
}

export function StaticPage({ path, showContactForm }: Props) {
  const page = staticPages[path];
  const [formSent, setFormSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!page) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-on-surface">Page not found.</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const message = String(fd.get('message') ?? '').trim();
    if (!email || !message) {
      setFormError('Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    setFormError(null);
    setFormSent(true);
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md">
      <nav className="sticky top-0 z-50 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-20">
          <Link to="/" className="flex items-center gap-2 group no-underline">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                cloud_download
              </span>
            </div>
            <span className="font-title-lg text-title-lg font-black text-primary tracking-tight">{site.brand}</span>
          </Link>
          <div className="hidden md:flex items-center gap-gutter">
            {site.navLinks.map((l) => (
              <Link key={l.route} to={l.route} className="text-on-surface-variant font-medium hover:text-primary transition-colors no-underline">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-stack-xl">
        <article className="max-w-3xl mx-auto glass-panel rounded-xl p-8 md:p-12 border border-outline-variant/20">
          <Link to="/" className="inline-flex items-center gap-1 text-primary font-label-sm text-label-sm mb-6 no-underline hover:underline">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to home
          </Link>
          <h1 className="font-display-lg text-display-lg text-on-background mb-4">{page.title}</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-8">{page.intro}</p>

          <div className="stitch-static-prose">
            {page.sections.map((s) => (
              <section key={s.heading}>
                <h2>{s.heading}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
              </section>
            ))}
          </div>

          {(showContactForm || path === '/contact') && (
            <div className="mt-10 pt-8 border-t border-outline-variant/30">
              {formSent ? (
                <p className="font-label-md text-label-md text-secondary font-semibold">
                  Thank you! We received your message and will reply within one business day.
                </p>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="contact-email" className="block font-label-md text-label-md text-on-surface mb-1">
                      Email
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      className="w-full h-12 px-4 rounded-lg border border-outline-variant/40 bg-surface-container-lowest text-on-surface"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-message" className="block font-label-md text-label-md text-on-surface mb-1">
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      required
                      rows={5}
                      className="w-full px-4 py-3 rounded-lg border border-outline-variant/40 bg-surface-container-lowest text-on-surface"
                      placeholder="How can we help?"
                    />
                  </div>
                  {formError && <p className="text-error text-sm">{formError}</p>}
                  <button
                    type="submit"
                    className="h-12 px-8 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:shadow-md transition-all"
                  >
                    Send message
                  </button>
                </form>
              )}
            </div>
          )}
        </article>
      </main>

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
              <Link key={l.route} to={l.route} className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors no-underline">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="font-body-md text-body-md text-outline text-sm">© {site.year} {site.brand}. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
