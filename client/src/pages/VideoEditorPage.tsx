import { useState } from 'react';
import { SiteHeader } from '../components/SiteHeader';
import { Footer } from '../components/Footer';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import type { Theme } from '../hooks/useTheme';
import { COMPANY } from '../config/company';
import { EditorLanding } from '../features/editor/components/EditorLanding';
import { EditorWorkspace } from '../features/editor/EditorWorkspace';

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
}

/**
 * Standalone Online Video Editor route. Intentionally separate from the
 * YouTube/Instagram downloader so download code stays untouched.
 */
export function VideoEditorPage({ theme, onToggleTheme }: Props) {
  useDocumentMeta({
    title: `Online Video Editor — Cut, Crop & Export · ${COMPANY.brand}`,
    description:
      'Edit videos in your browser with VidCliply: trim, crop, rotate, flip, change speed, merge clips, and export — free, no account, no watermark.',
  });

  const [projectFiles, setProjectFiles] = useState<File[] | null>(null);

  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} maxWidth="max-w-6xl" />
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-2">
        {projectFiles ? (
          <EditorWorkspace initialFiles={projectFiles} onClose={() => setProjectFiles(null)} />
        ) : (
          <EditorLanding onFiles={(files) => setProjectFiles(files)} />
        )}
      </main>
      <Footer />
    </div>
  );
}
