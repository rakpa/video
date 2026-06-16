import { stitchRoutes } from '../content/stitchPages';

export const screenRoutes = stitchRoutes;

export const entityRoutePrefix = '/how-it-works';

export const entitySlugs = ['paste-link', 'select-quality', 'download'] as const;

export const staticRoutePaths = [
  '/about',
  '/privacy-policy',
  '/terms-of-service',
  '/contact',
  '/features',
  '/history',
  '/api',
] as const;

/** Legacy legal paths from the original app — redirect targets. */
export const legacyLegalRedirects: Record<string, string> = {
  '/terms': '/terms-of-service',
  '/privacy': '/privacy-policy',
  '/dmca': '/contact',
  '/refunds': '/pricing',
};

export const routeTable = [
  { screen: 'home', path: '/', stitchTitle: 'StreamSave - Integrated Home' },
  { screen: 'features', path: '/features', type: 'static' },
  { screen: 'pricing', path: '/pricing', type: 'app' },
  { screen: 'history', path: '/history', type: 'static' },
  { screen: 'api', path: '/api', type: 'static' },
  { screen: 'about', path: '/about', type: 'static' },
  { screen: 'privacy', path: '/privacy-policy', type: 'static' },
  { screen: 'terms', path: '/terms-of-service', type: 'static' },
  { screen: 'contact', path: '/contact', type: 'static' },
  ...entitySlugs.map((slug) => ({
    screen: `how-it-works/${slug}`,
    path: `${entityRoutePrefix}/${slug}`,
    type: 'entity' as const,
  })),
];
