import { Faq } from '../../../components/Faq';
import { HIDE_PRO } from '../../../config/build';
import { COMPANY } from '../../../config/company';
import { UploadZone } from './UploadZone';

interface Props {
  onFiles: (files: File[]) => void;
  busy?: boolean;
}

const HOW_STEPS = [
  {
    title: 'Upload a video',
    body: 'Click Choose video or drag and drop from your device. Start with a shorter clip while you explore the tools.',
  },
  {
    title: 'Edit the timeline',
    body: 'Trim start and end, add more clips, split at the playhead, and arrange fragments on the timeline.',
  },
  {
    title: 'Make necessary edits',
    body: 'Crop the frame, rotate, flip, change speed, and set canvas size or background to fit your platform.',
  },
  {
    title: 'Download your edit',
    body: 'Hit Export to render in your browser — no account, no watermark — then save the finished file.',
  },
];

const WHY = [
  {
    title: 'Free to use',
    body: 'Upload, edit, and download without creating an account. Keep the downloader for social links and the editor for your own files.',
  },
  {
    title: 'Simple design',
    body: 'Focused tools: trim, crop, rotate, flip, speed, and canvas — fast to learn, quick to finish.',
  },
  {
    title: 'No account required',
    body: 'Projects stay on your device. We don’t need a login to cut or transform files you already own.',
  },
  {
    title: 'Runs in the browser',
    body: 'Modern Chrome, Edge, Firefox, and Safari can preview and export without installing desktop software.',
  },
  {
    title: 'Popular formats',
    body: 'Works with common uploads like MP4, WebM, and MOV. If a file won’t open, try re-encoding to MP4.',
  },
  {
    title: 'Edit longer clips',
    body: 'Bring in webinars or recordings and cut the parts you don’t need before you publish.',
  },
];

const EDITOR_FAQ = [
  {
    q: 'Is the video editor free?',
    a: `Yes. ${COMPANY.brand}’s browser editor lets you upload, trim, transform, and export without an account. Exports use your device — no watermark from us.`,
  },
  {
    q: 'What formats can I edit?',
    a: 'Most browsers handle MP4, WebM, and MOV well. Support depends on your browser’s codecs. If a file fails to load, convert it to H.264 MP4 and try again.',
  },
  {
    q: 'Is editing online better than desktop apps?',
    a: 'For quick cuts, crops, and speed changes, yes — nothing to install. Heavy color grading or effects still belong in a desktop suite.',
  },
  {
    q: 'Which browsers work?',
    a: 'Chrome, Edge, Firefox, and Safari on desktop. On phones, Chrome (Android) and Safari (iOS) work for upload and preview; export works best on desktop.',
  },
  {
    q: 'Do you add a watermark?',
    a: 'No. Your source file stays yours, and the exported edit is yours.',
  },
  {
    q: 'Where is my video processed?',
    a: 'Preview and export run in your browser. Unlike the downloader, the editor does not upload your local files to our servers.',
  },
];

/** Marketing + how-to sections modeled on online video cutter landing pages. */
export function EditorLanding({ onFiles, busy }: Props) {
  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="pt-4 text-center sm:pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">{HIDE_PRO ? 'Video Editor' : 'Online Video Editor'}</p>
        <h1 className="mt-3 text-[clamp(1.9rem,5.5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-slate-900">
          {HIDE_PRO ? 'Easily edit your videos' : 'Easily edit videos in the browser'}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base font-medium text-slate-600 sm:text-lg">
          Cut, crop, rotate, flip, change speed, and merge clips{HIDE_PRO ? '.' : ' — without installing software.'} Built into{' '}
          {COMPANY.brand}, separate from the downloader.
        </p>
        <div className="mx-auto mt-8 max-w-3xl">
          <UploadZone onFiles={onFiles} busy={busy} />
        </div>
      </section>

      {!HIDE_PRO && (
        <>
      <section>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Easily edit videos right in the browser
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-relaxed text-slate-600 sm:text-base">
          Online editing is practical for personal footage and simple commercial cuts. There is no steep learning path —
          upload a file, shape the timeline, apply crop or rotation, and export. Trim, merge, crop, resize the canvas,
          and change speed without leaving {COMPANY.brand}.
        </p>
      </section>

      <section id="how-to-edit">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          How to edit a video online
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_STEPS.map((step, i) => (
            <article key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <span className="text-3xl font-black text-slate-200">{i + 1}</span>
              <h3 className="mt-2 text-base font-bold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Create great content for media platforms
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-relaxed text-slate-600 sm:text-base">
          Process your own recordings and downloads (when you have the rights) into vertical or horizontal cuts ready for
          social feeds. Pair this editor with {COMPANY.brand}’s downloader when you need a source file from YouTube,
          Facebook, or Instagram first.
        </p>
      </section>

      <section id="why-editor">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Why choose us</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Format-friendly tools
        </h2>
        <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
          {['MP4', 'WebM', 'MOV', 'M4V', 'Trim', 'Crop', 'Rotate', 'Flip', 'Speed', 'Merge'].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <Faq items={EDITOR_FAQ} title="Video editor FAQ" />
        </>
      )}
    </div>
  );
}
