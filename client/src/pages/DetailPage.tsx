import { Link, useParams } from 'react-router-dom';
import { getEntityBySlug } from '../content/entities';
import { site } from '../content/site';

export function DetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const entity = slug ? getEntityBySlug(slug) : undefined;

  if (!entity) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-on-surface font-headline-md">Guide not found.</p>
        <Link to="/" className="text-primary hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md">
      <nav className="sticky top-0 z-50 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-20">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                cloud_download
              </span>
            </div>
            <span className="font-title-lg text-title-lg font-black text-primary tracking-tight">{site.brand}</span>
          </Link>
        </div>
      </nav>

      <main className="flex-grow max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-stack-xl">
        <article className="max-w-3xl mx-auto">
          <Link
            to="/#how-it-works"
            className="inline-flex items-center gap-1 text-primary font-label-sm text-label-sm mb-8 no-underline hover:underline"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            How it Works
          </Link>

          <div className="bg-surface rounded-xl p-8 md:p-12 border border-outline-variant/20 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-full -z-10" />
            <div className="w-12 h-12 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center mb-6">
              <span className="material-symbols-outlined">{entity.icon}</span>
            </div>
            <div className="font-label-sm text-label-sm text-primary mb-2">{entity.step}</div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">{entity.title}</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mb-8">{entity.subtitle}</p>

            <div className="stitch-static-prose">
              {entity.body.map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}
            </div>

            <div className="mt-10 p-stack-lg rounded-lg bg-surface-container-low border border-outline-variant/20">
              <h2 className="font-title-lg text-title-lg text-on-surface mb-4">Pro tips</h2>
              <ul className="space-y-2">
                {entity.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 font-body-md text-body-md text-on-surface-variant">
                    <span className="material-symbols-outlined text-secondary text-sm mt-0.5">check_circle</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/"
                className="h-12 px-8 bg-primary text-on-primary rounded-lg font-label-md text-label-md inline-flex items-center justify-center no-underline hover:shadow-md transition-all"
              >
                Try it now
              </Link>
              <Link
                to="/features"
                className="h-12 px-8 bg-surface-container-high text-on-surface rounded-lg font-label-md text-label-md inline-flex items-center justify-center no-underline hover:bg-surface-variant transition-all"
              >
                See all features
              </Link>
            </div>
          </div>
        </article>
      </main>

      <footer className="bg-surface-container-low border-t border-outline-variant/20 w-full mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto gap-stack-md">
          <span className="font-title-lg text-title-lg font-black text-on-surface">{site.brand}</span>
          <div className="flex flex-wrap justify-center gap-6">
            {site.footerLinks.map((l) => (
              <Link key={l.route} to={l.route} className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary no-underline">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
