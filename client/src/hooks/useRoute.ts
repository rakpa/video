import { useEffect, useState } from 'react';

/**
 * Minimal client-side router (no dependency). Reads `location.pathname` and
 * re-renders on navigation. Vite's dev server and most static hosts serve
 * index.html for unknown paths, so deep links like /terms work directly.
 */
export function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  return path;
}

/** Navigate to an internal path and scroll to top, without a full reload. */
export function navigate(to: string): void {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}
