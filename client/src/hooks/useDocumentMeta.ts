import { useEffect } from 'react';
import { COMPANY } from '../config/company';

interface Meta {
  title: string;
  description: string;
}

/** Ensures a <meta>/<link>-style tag exists, then sets one of its attributes. */
function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Per-route SEO meta. Updates the document title, meta description, the Open
 * Graph / Twitter equivalents, and the canonical URL — creating any tag that is
 * missing. Lets each SPA route present its own title/description to crawlers and
 * social-media link unfurlers without a separate static HTML file per page.
 */
export function useDocumentMeta({ title, description }: Meta) {
  useEffect(() => {
    const fullTitle = title.includes(COMPANY.brand) ? title : `${title} · ${COMPANY.brand}`;
    document.title = fullTitle;

    setTag(
      'meta[name="description"]',
      () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'description');
        return m;
      },
      'content',
      description,
    );

    const og: Array<[string, string]> = [
      ['og:title', fullTitle],
      ['og:description', description],
      ['twitter:title', fullTitle],
      ['twitter:description', description],
    ];
    for (const [property, content] of og) {
      const key = property.startsWith('twitter') ? 'name' : 'property';
      setTag(
        `meta[${key}="${property}"]`,
        () => {
          const m = document.createElement('meta');
          m.setAttribute(key, property);
          return m;
        },
        'content',
        content,
      );
    }

    const canonical = `https://${COMPANY.domain}${window.location.pathname}`;
    setTag(
      'link[rel="canonical"]',
      () => {
        const l = document.createElement('link');
        l.setAttribute('rel', 'canonical');
        return l;
      },
      'href',
      canonical,
    );
  }, [title, description]);
}
