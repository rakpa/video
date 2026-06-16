export interface StaticPageContent {
  title: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
}

export const staticPages: Record<string, StaticPageContent> = {
  '/about': {
    title: 'About StreamSave',
    intro:
      'StreamSave is a modern video and audio downloader built for people who want fast, reliable saves without ads, watermarks, or complicated software.',
    sections: [
      {
        heading: 'Our mission',
        paragraphs: [
          'We believe saving content you have the right to access should be simple. Whether you are archiving your own uploads, grabbing a tutorial for offline study, or keeping a podcast episode for a flight, StreamSave removes the friction.',
          'Founded in 2024, our team combines media engineering expertise with a focus on privacy-first design. We never index, resell, or permanently store the files you download.',
        ],
      },
      {
        heading: 'What we support',
        paragraphs: [
          'StreamSave handles YouTube, Facebook, Instagram, and many additional platforms through a unified paste-and-download workflow. Formats range from MP3 audio to 4K MP4 video with merged sound.',
        ],
      },
      {
        heading: 'Responsible use',
        paragraphs: [
          'You are responsible for ensuring you have the legal right to download any content. StreamSave is a technical tool — we do not host third-party media and are not affiliated with any platform.',
        ],
      },
    ],
  },
  '/privacy-policy': {
    title: 'Privacy Policy',
    intro: 'Last updated: June 2026. This policy explains how StreamSave handles your information.',
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'URLs you submit are processed transiently to fulfill your download request. We do not build a profile of your viewing or download history beyond optional local session data in your browser.',
          'We collect minimal technical data — IP address, browser type, and timestamps — for security, abuse prevention, and rate limiting.',
          'If you subscribe to Pro, billing data is handled by our payment processor; we never store full card numbers.',
        ],
      },
      {
        heading: 'Files are not stored',
        paragraphs: [
          'Media files are processed only for the moment needed to deliver your download, streamed to your device, and then automatically deleted from our servers.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'Depending on your location, you may request access, correction, or deletion of personal data. Contact support@streamsave.app for privacy enquiries.',
        ],
      },
    ],
  },
  '/terms-of-service': {
    title: 'Terms of Service',
    intro: 'By using StreamSave you agree to these terms. If you do not agree, please do not use the service.',
    sections: [
      {
        heading: 'The service',
        paragraphs: [
          'StreamSave is a tool that retrieves media from URLs you provide. We do not host, store, or index third-party content.',
        ],
      },
      {
        heading: 'Your responsibility',
        paragraphs: [
          'You must only download content you own or have explicit permission to save. Downloading copyrighted material without authorization is prohibited and is your sole responsibility.',
        ],
      },
      {
        heading: 'Disclaimer',
        paragraphs: [
          'The service is provided "as is" without warranties. We are not liable for indirect damages arising from your use of downloaded content or the service itself.',
        ],
      },
    ],
  },
  '/contact': {
    title: 'Contact Support',
    intro: 'We are here to help with downloads, billing, and account questions.',
    sections: [
      {
        heading: 'Get in touch',
        paragraphs: [
          'Email us at support@streamsave.app — we typically respond within one business day.',
          'For DMCA or copyright notices, include "DMCA" in the subject line with details of the claimed infringement.',
        ],
      },
      {
        heading: 'Before you write',
        paragraphs: [
          'Include the URL you tried to download, the format you selected, and any error message shown. Screenshots help us diagnose issues faster.',
        ],
      },
    ],
  },
  '/features': {
    title: 'Features',
    intro: 'Everything StreamSave offers to make downloading effortless.',
    sections: [
      {
        heading: 'Universal link support',
        paragraphs: [
          'Paste any supported video URL — YouTube, Facebook, Instagram, and more. Automatic platform detection means zero configuration.',
        ],
      },
      {
        heading: 'Quality on your terms',
        paragraphs: [
          'Choose from 720p, 1080p, 2K, or 4K video, or extract MP3 audio. Every video download includes merged audio — no silent files.',
        ],
      },
      {
        heading: 'Privacy by design',
        paragraphs: [
          'No permanent storage of your downloads on our servers. SSL encryption end-to-end. No account required for free tier.',
        ],
      },
      {
        heading: 'Pro upgrades',
        paragraphs: [
          'Unlock 4K, unlimited downloads, priority processing, and batch tools with a simple subscription. See Pricing for plans.',
        ],
      },
    ],
  },
  '/history': {
    title: 'My Downloads',
    intro: 'Your recent download sessions on this device.',
    sections: [
      {
        heading: 'Local history',
        paragraphs: [
          'StreamSave keeps a lightweight history in your browser so you can re-download recent files or check what you saved last session. History is never uploaded to our servers.',
        ],
      },
      {
        heading: 'No account needed',
        paragraphs: [
          'Free users see the last 10 downloads. Pro subscribers get unlimited local history and export options.',
        ],
      },
    ],
  },
  '/api': {
    title: 'API Documentation',
    intro: 'Integrate StreamSave download capabilities into your own applications.',
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'The StreamSave API lets approved developers analyze URLs and trigger downloads programmatically. All requests require an API key issued from your Pro dashboard.',
        ],
      },
      {
        heading: 'Endpoints',
        paragraphs: [
          'POST /api/v1/analyze — pass a URL and receive available formats with metadata.',
          'POST /api/v1/download — start a download job and receive a progress stream via Server-Sent Events.',
        ],
      },
      {
        heading: 'Rate limits',
        paragraphs: [
          'Free API keys: 100 requests per day. Pro API keys: 10,000 requests per day with burst allowance. Contact sales for enterprise limits.',
        ],
      },
    ],
  },
};
