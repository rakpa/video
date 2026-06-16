export interface Entity {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  step: string;
  body: string[];
  tips: string[];
}

export const entities: Entity[] = [
  {
    slug: 'paste-link',
    title: 'Paste Link',
    subtitle: 'Step 1 — Copy any supported video URL',
    icon: 'content_paste',
    step: 'Step 1',
    body: [
      'StreamSave works with URLs from YouTube, Facebook, Instagram, and dozens of other platforms. Simply copy the share link from your browser or mobile app and paste it into the input field on the home page.',
      'Our smart parser detects the platform automatically — no need to pick a source or install browser extensions. Paste a single link or queue multiple downloads one after another.',
      'Supported formats include standard watch URLs, shorts, reels, and most public video pages. Private or login-gated content cannot be downloaded without proper access rights.',
    ],
    tips: [
      'Use the full URL from your browser address bar for best results.',
      'Mobile share links from the YouTube or Instagram app work perfectly.',
      'Avoid shortened redirect links when possible — direct URLs parse faster.',
    ],
  },
  {
    slug: 'select-quality',
    title: 'Select Quality',
    subtitle: 'Step 2 — Choose resolution and format',
    icon: 'tune',
    step: 'Step 2',
    body: [
      'After analyzing your link, StreamSave lists every available format: from lightweight 720p MP4 files to stunning 4K Ultra HD with merged audio. Audio-only MP3 extraction is available for music, podcasts, and lectures.',
      'Each option shows estimated file size so you can pick the right balance between quality and storage. Free users can download up to 1080p with sound; Pro unlocks 2K, 4K, and unlimited downloads.',
      'Video and audio streams are merged server-side into a single ready-to-play file — you never receive a silent video or a separate audio track to combine manually.',
    ],
    tips: [
      '1080p is the sweet spot for most phones and laptops.',
      'Choose MP3 when you only need the soundtrack or voice track.',
      '4K files are large — ensure you have enough storage and bandwidth.',
    ],
  },
  {
    slug: 'download',
    title: 'Download',
    subtitle: 'Step 3 — Save to your device instantly',
    icon: 'task_alt',
    step: 'Step 3',
    body: [
      'Hit Download and StreamSave fetches, merges, and delivers your file through a secure encrypted connection. Progress is shown in real time with speed and ETA so you always know what is happening.',
      'Files stream directly to your browser — nothing is stored permanently on our servers. Once the transfer completes, the temporary copy is deleted automatically for your privacy.',
      'Need the same file again? Use My Downloads to see your recent sessions or simply paste the URL once more. Pro subscribers get priority processing during peak hours.',
    ],
    tips: [
      'Keep the browser tab open until the download finishes.',
      'If a download fails, retry — transient network issues are common.',
      'Check your browser downloads folder if the file does not appear.',
    ],
  },
];

export function getEntityBySlug(slug: string): Entity | undefined {
  return entities.find((e) => e.slug === slug);
}
