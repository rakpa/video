export const site = {
  brand: 'StreamSave',
  tagline: 'Download Any Video. Instantly. Securely.',
  description:
    'The fastest, most reliable tool to save high-quality content from your favorite platforms directly to your device. No ads, no limits.',
  contactEmail: 'support@streamsave.app',
  year: 2026,
  footerLinks: [
    { label: 'Privacy Policy', route: '/privacy-policy' },
    { label: 'Terms of Service', route: '/terms-of-service' },
    { label: 'Contact Support', route: '/contact' },
    { label: 'API Documentation', route: '/api' },
  ],
  navLinks: [
    { label: 'Features', route: '/features' },
    { label: 'How it Works', route: '/#how-it-works' },
    { label: 'Pricing', route: '/pricing' },
    { label: 'My Downloads', route: '/history' },
  ],
} as const;
