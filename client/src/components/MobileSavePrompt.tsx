import { motion } from 'framer-motion';
import { Button } from './Button';
import { formatFileSize } from '../utils/saveVideo';

interface Props {
  filename: string;
  sizeBytes: number;
  saving?: boolean;
  onSave: () => void;
  onDone: () => void;
}

/** Single-step mobile save — mimics the iOS share file row, one tap to open Save Video. */
export function MobileSavePrompt({ filename, sizeBytes, saving, onSave, onDone }: Props) {
  const stem = filename.replace(/\.mp4$/i, '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden rounded-3xl shadow-card"
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-center text-sm font-medium text-slate-500">Ready to save</p>
      </div>

      <div className="flex items-center gap-4 px-5 py-5">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-100">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 10 4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-slate-900">{stem}</p>
          <p className="text-sm text-slate-500">Video · {formatFileSize(sizeBytes)}</p>
        </div>
      </div>

      <div className="space-y-3 px-5 pb-5">
        <Button className="w-full" onClick={onSave} disabled={saving}>
          {saving ? 'Opening…' : 'Save Video'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onDone} disabled={saving}>
          Done
        </Button>
      </div>
    </motion.div>
  );
}
