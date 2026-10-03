import type { CanvasSettings, CropRect, EditorClip, EditorTool } from '../types';

interface Props {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  clip: EditorClip | null;
  canvas: CanvasSettings;
  onTransformPatch: (patch: Partial<EditorClip['transform']>) => void;
  onCanvasChange: (patch: Partial<CanvasSettings>) => void;
}

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: 'crop', label: 'Crop' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'flip', label: 'Flip' },
  { id: 'speed', label: 'Speed' },
  { id: 'canvas', label: 'Canvas' },
];

/** Side panel for crop / rotate / flip / speed / canvas (trim lives in SoloTrimBar). */
export function ToolPanel({
  tool,
  onToolChange,
  clip,
  canvas,
  onTransformPatch,
  onCanvasChange,
}: Props) {
  const activeTool = tool === 'trim' ? 'crop' : tool;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Style & frame</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToolChange(t.id)}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition sm:text-sm ${
              activeTool === t.id
                ? 'bg-indigo-600 text-white shadow-glow-soft'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        {!clip ? (
          <p className="text-sm font-medium text-slate-500">Upload a video to use these tools.</p>
        ) : activeTool === 'crop' ? (
          <CropControls
            crop={clip.transform.crop}
            onChange={(crop) => onTransformPatch({ crop })}
          />
        ) : activeTool === 'rotate' ? (
          <div className="flex flex-wrap gap-2">
            {([0, 90, 180, 270] as const).map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => onTransformPatch({ rotation: deg })}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  clip.transform.rotation === deg
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {deg}°
              </button>
            ))}
          </div>
        ) : activeTool === 'flip' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onTransformPatch({ flipH: !clip.transform.flipH })}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                clip.transform.flipH ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Flip horizontal
            </button>
            <button
              type="button"
              onClick={() => onTransformPatch({ flipV: !clip.transform.flipV })}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                clip.transform.flipV ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Flip vertical
            </button>
          </div>
        ) : activeTool === 'speed' ? (
          <div>
            <label className="flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>Playback speed</span>
              <span className="tabular-nums text-indigo-600">{clip.transform.speed.toFixed(2)}×</span>
            </label>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={clip.transform.speed}
              onChange={(e) => onTransformPatch({ speed: Number(e.target.value) })}
              className="mt-3 w-full accent-indigo-600"
            />
            <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
              <span>0.25×</span>
              <span>1×</span>
              <span>2×</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-700">Canvas size</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['source', '16:9', '9:16', '1:1', '4:5'] as const).map((aspect) => (
                  <button
                    key={aspect}
                    type="button"
                    onClick={() => onCanvasChange({ aspect })}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${
                      canvas.aspect === aspect
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {aspect === 'source' ? 'Original' : aspect}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Background</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {['#0f172a', '#000000', '#ffffff', '#22c55e', '#6366f1'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onCanvasChange({ background: color })}
                    className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ${
                      canvas.background === color ? 'ring-indigo-500' : 'ring-transparent'
                    }`}
                    style={{ background: color }}
                    aria-label={`Background ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CropControls({
  crop,
  onChange,
}: {
  crop: CropRect;
  onChange: (crop: CropRect) => void;
}) {
  const set = (key: keyof CropRect, value: number) => {
    const next = { ...crop, [key]: value };
    if (next.x + next.w > 1) next.w = 1 - next.x;
    if (next.y + next.h > 1) next.h = 1 - next.y;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {(
        [
          ['x', 'Left', crop.x],
          ['y', 'Top', crop.y],
          ['w', 'Width', crop.w],
          ['h', 'Height', crop.h],
        ] as const
      ).map(([key, label, value]) => (
        <label key={key} className="block">
          <span className="flex justify-between text-xs font-semibold text-slate-600">
            <span>{label}</span>
            <span className="tabular-nums">{Math.round(value * 100)}%</span>
          </span>
          <input
            type="range"
            min={key === 'w' || key === 'h' ? 0.2 : 0}
            max={1}
            step={0.01}
            value={value}
            onChange={(e) => set(key, Number(e.target.value))}
            className="mt-1 w-full accent-indigo-600"
          />
        </label>
      ))}
      <button
        type="button"
        onClick={() => onChange({ x: 0, y: 0, w: 1, h: 1 })}
        className="text-xs font-semibold text-indigo-600 hover:underline"
      >
        Reset crop
      </button>
    </div>
  );
}
