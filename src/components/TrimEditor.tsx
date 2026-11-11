import { useEffect, useRef, useState } from 'react';
import { fetchSoundBlob } from '../services/soundRepository';
import { MIN_TRIM_SECONDS, RATE_MAX, RATE_MIN, clampRate, realSeconds } from '../utils/trim';

interface Props {
  storagePath: string;
  fileDuration: number;
  peaks: Uint8Array | null;
  start: number;
  end: number; // luôn là giây thật (= fileDuration khi không cắt cuối)
  onChange: (start: number, end: number) => void;
  rate: number;
  onRate: (r: number) => void;
  previewVolume: number; // 0..1
  /** Không cho đổi điểm cắt (cue đang phát). */
  locked: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => n.toFixed(2);
const RATE_QUICK = [0.75, 1, 1.25, 1.5] as const;

/** Trình chỉnh cắt (trim) không phá hủy: kéo hai tay nắm trên sóng âm hoặc gõ số; nghe thử trước khi lưu. */
export function TrimEditor({ storagePath, fileDuration, peaks, start, end, onChange, rate, onRate, previewVolume, locked }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [startText, setStartText] = useState(fmt(start));
  const [endText, setEndText] = useState(fmt(end));
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const raf = useRef(0);
  const H = 72;

  useEffect(() => setStartText(fmt(start)), [start]);
  useEffect(() => setEndText(fmt(end)), [end]);

  const stopPreview = () => {
    cancelAnimationFrame(raf.current);
    audio.current?.pause();
    setPreviewing(false);
  };
  useEffect(() => {
    const onStopAll = () => stopPreview();
    window.addEventListener('stage-stop-all', onStopAll);
    return () => {
      window.removeEventListener('stage-stop-all', onStopAll);
      cancelAnimationFrame(raf.current);
      audio.current?.pause();
      audio.current = null;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);

  // Đổi điểm cắt/tốc độ khi đang nghe thử → dừng để khỏi nghe bản cũ.
  useEffect(() => {
    if (previewing) stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const cv = canvas.current;
    const el = box.current;
    if (!cv || !el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(el.clientWidth));
    cv.width = w * dpr;
    cv.height = H * dpr;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const n = peaks?.length ?? 0;
    const bars = n > 0 ? Math.min(n, Math.floor(w / 3)) : 0;
    const mid = H / 2;
    const sx = (start / fileDuration) * w;
    const ex = (end / fileDuration) * w;
    if (bars === 0) {
      g.fillStyle = '#64748b';
      g.fillRect(0, mid - 1, w, 2);
    } else {
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const from = Math.floor((i * n) / bars);
        const to = Math.max(from + 1, Math.floor(((i + 1) * n) / bars));
        let p = 0;
        for (let k = from; k < to; k++) p = Math.max(p, peaks![k]);
        const h = Math.max(2, (p / 255) * (H - 6));
        const x = i * bw;
        g.fillStyle = x + bw / 2 >= sx && x + bw / 2 <= ex ? '#38bdf8' : '#334155';
        g.fillRect(x + 0.5, mid - h / 2, Math.max(1, bw - 1.5), h);
      }
    }
    g.fillStyle = 'rgba(251,191,36,0.9)';
    g.fillRect(Math.max(0, sx - 1), 0, 2, H);
    g.fillRect(Math.min(w - 2, ex - 1), 0, 2, H);
  }, [peaks, start, end, fileDuration]);

  const secondsAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return r3(Math.min(fileDuration, Math.max(0, ((clientX - r.left) / Math.max(1, r.width)) * fileDuration)));
  };
  const setStart = (v: number) => onChange(r3(Math.min(Math.max(0, v), end - MIN_TRIM_SECONDS)), end);
  const setEnd = (v: number) => onChange(start, r3(Math.max(Math.min(fileDuration, v), start + MIN_TRIM_SECONDS)));

  const startHandleDrag = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(which);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    const t = secondsAt(e.clientX);
    if (dragging === 'start') setStart(t);
    else setEnd(t);
  };
  const keyHandle = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    if (locked) return;
    const step = e.shiftKey ? 0.5 : 0.05;
    const d = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    if (!d) return;
    e.preventDefault();
    if (which === 'start') setStart(start + d);
    else setEnd(end + d);
  };

  const commitText = (which: 'start' | 'end') => {
    const raw = which === 'start' ? startText : endText;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v)) {
      if (which === 'start') setStartText(fmt(start));
      else setEndText(fmt(end));
      return;
    }
    if (which === 'start') setStart(v);
    else setEnd(v);
    if (which === 'start') setStartText(fmt(Math.min(Math.max(0, v), end - MIN_TRIM_SECONDS)));
    else setEndText(fmt(Math.max(Math.min(fileDuration, v), start + MIN_TRIM_SECONDS)));
  };

  const preview = async () => {
    if (previewing) return stopPreview();
    setPreviewError(null);
    try {
      if (!audio.current) {
        const blob = await fetchSoundBlob(storagePath);
        audioUrl.current = URL.createObjectURL(blob);
        const a = new Audio(audioUrl.current);
        a.preservesPitch = false; // giống tốc độ khi diễn: đổi tốc độ thì đổi cao độ
        audio.current = a;
      }
      const a = audio.current;
      a.volume = Math.min(1, Math.max(0, previewVolume));
      a.playbackRate = rate;
      a.currentTime = start;
      await a.play();
      setPreviewing(true);
      const tick = () => {
        if (!audio.current || audio.current.paused) return;
        if (audio.current.currentTime >= end - 0.005 || audio.current.ended) {
          stopPreview();
          return;
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (err) {
      setPreviewing(false);
      setPreviewError(err instanceof Error ? err.message : 'Không nghe thử được.');
    }
  };

  const trimmed = start > 0.001 || end < fileDuration - 0.001;
  const len = end - start;
  const handleStyle = (t: number) => ({ left: `calc(${(t / fileDuration) * 100}% - 12px)` });

  return (
    <fieldset className="space-y-3 rounded-lg border border-stage-600 p-3" disabled={false}>
      <legend className="px-1 text-sm font-semibold">Cắt (trim) & tốc độ</legend>
      <p className="text-xs text-slate-400">
        Chỉ phát đoạn giữa hai vạch vàng. File gốc không bị sửa; đặt lại bất cứ lúc nào.
      </p>

      <div ref={box} className="relative w-full select-none rounded-md bg-stage-900" style={{ height: H, touchAction: 'none' }} onPointerMove={moveDrag} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
        <canvas ref={canvas} style={{ width: '100%', height: H }} className="block" />
        {(['start', 'end'] as const).map((w) => (
          <div
            key={w}
            role="slider"
            tabIndex={locked ? -1 : 0}
            aria-label={w === 'start' ? 'Điểm bắt đầu' : 'Điểm kết thúc'}
            aria-valuemin={0}
            aria-valuemax={fileDuration}
            aria-valuenow={w === 'start' ? start : end}
            aria-valuetext={`${fmt(w === 'start' ? start : end)} giây`}
            aria-disabled={locked}
            className={`absolute top-0 flex h-full w-6 items-center justify-center ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-ew-resize'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400`}
            style={handleStyle(w === 'start' ? start : end)}
            onPointerDown={startHandleDrag(w)}
            onKeyDown={keyHandle(w)}
          >
            <span className="h-8 w-2.5 rounded-sm bg-amber-300 shadow ring-1 ring-black/40" />
          </div>
        ))}
      </div>

      {locked && (
        <p role="status" className="text-sm text-amber-300">
          Âm thanh này đang phát. Hãy dừng nó trước khi chỉnh điểm cắt.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Bắt đầu (giây)
          <input
            inputMode="decimal"
            className="field mt-1"
            value={startText}
            disabled={locked}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={() => commitText('start')}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commitText('start'))}
          />
        </label>
        <label className="block text-sm">
          Kết thúc (giây)
          <input
            inputMode="decimal"
            className="field mt-1"
            value={endText}
            disabled={locked}
            onChange={(e) => setEndText(e.target.value)}
            onBlur={() => commitText('end')}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commitText('end'))}
          />
        </label>
      </div>
      <p className="text-xs text-slate-300" aria-live="polite">
        File gốc {fmt(fileDuration)} giây · đoạn phát <strong>{fmt(len)}</strong> giây
        {Math.abs(rate - 1) > 0.001 && (
          <>
            {' '}→ <strong>{fmt(realSeconds(len, rate))}</strong> giây thực ở tốc độ ×{rate.toFixed(2)}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn h-10 px-4 bg-sky-700 hover:bg-sky-600 text-sm" onClick={() => void preview()}>
          {previewing ? '■ Dừng nghe thử' : '▶ Nghe thử đoạn này'}
        </button>
        <button
          type="button"
          className="btn h-10 px-3 bg-stage-700 hover:bg-stage-600 text-sm"
          disabled={locked || !trimmed}
          onClick={() => onChange(0, fileDuration)}
        >
          Bỏ cắt
        </button>
        <span className="text-xs text-slate-400">Nghe thử phát qua loa máy này, không qua Master.</span>
      </div>
      {previewError && <p role="alert" className="text-sm text-red-300">{previewError}</p>}

      <div className="space-y-1">
        <label className="block text-sm" htmlFor="rate-default">
          Tốc độ mặc định: <strong>×{rate.toFixed(2)}</strong>
        </label>
        <input
          id="rate-default"
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={0.05}
          value={rate}
          onChange={(e) => onRate(clampRate(Number(e.target.value)))}
          className="w-full"
        />
        <div className="flex flex-wrap items-center gap-2">
          {RATE_QUICK.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={Math.abs(rate - q) < 0.001}
              onClick={() => onRate(q)}
              className={`btn h-8 px-3 text-xs ${Math.abs(rate - q) < 0.001 ? 'bg-sky-600' : 'bg-stage-700 hover:bg-stage-600'}`}
            >
              ×{q}
            </button>
          ))}
          <span className="text-xs text-slate-400">Chậm/nhanh hơn cũng làm trầm/cao hơn (như băng cassette).</span>
        </div>
      </div>
    </fieldset>
  );
}
