import { useEffect, useRef } from 'react';
import type { CanvasSettings, EditorClip } from '../types';
import { drawFrame } from '../utils/exportVideo';
import { formatEditorTime } from '../utils/time';

interface Props {
  clip: EditorClip | null;
  canvas: CanvasSettings;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (t: number) => void;
  onEnded: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}

/** Live preview stage — mirrors export transforms on a canvas over the video. */
export function PreviewStage({
  clip,
  canvas,
  playing,
  currentTime,
  onTimeUpdate,
  onEnded,
  videoRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const c = canvasRef.current;
    if (!video || !c || !clip) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const paint = () => {
      const { w, h } = previewSize(clip, canvas);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      drawFrame(ctx, video, clip, canvas, w, h);
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [clip, canvas, videoRef, playing, currentTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    if (Math.abs(video.currentTime - currentTime) > 0.35 && !playing) {
      video.currentTime = currentTime;
    }
  }, [currentTime, clip, playing, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    video.playbackRate = clip.transform.speed;
    if (playing) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [playing, clip, videoRef]);

  if (!clip) {
    return (
      <div className="grid aspect-video w-full place-items-center rounded-2xl bg-slate-900 text-sm font-medium text-slate-400">
        Preview will appear here
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-950 shadow-card ring-1 ring-slate-800">
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        src={clip.objectUrl}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        playsInline
        preload="auto"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (t >= clip.trimEnd) {
            e.currentTarget.pause();
            e.currentTarget.currentTime = clip.trimEnd;
            onEnded();
            return;
          }
          if (t < clip.trimStart) {
            e.currentTarget.currentTime = clip.trimStart;
          }
          onTimeUpdate(e.currentTarget.currentTime);
        }}
        onEnded={onEnded}
      />
      <div className="flex aspect-video items-center justify-center bg-black">
        <canvas ref={canvasRef} className="max-h-full max-w-full" />
      </div>
      <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white tabular-nums">
        {formatEditorTime(currentTime)} / {formatEditorTime(clip.trimEnd)}
      </div>
    </div>
  );
}

function previewSize(clip: EditorClip, canvas: CanvasSettings): { w: number; h: number } {
  const rotated = clip.transform.rotation === 90 || clip.transform.rotation === 270;
  let w = rotated ? clip.height : clip.width;
  let h = rotated ? clip.width : clip.height;
  w = Math.max(2, Math.round(w * clip.transform.crop.w));
  h = Math.max(2, Math.round(h * clip.transform.crop.h));
  if (canvas.aspect !== 'source') {
    const [aw, ah] = canvas.aspect.split(':').map(Number);
    const ratio = aw / ah;
    if (w / h > ratio) h = Math.round(w / ratio);
    else w = Math.round(h * ratio);
  }
  const max = 960;
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    w: Math.max(2, Math.round(w * scale)),
    h: Math.max(2, Math.round(h * scale)),
  };
}
