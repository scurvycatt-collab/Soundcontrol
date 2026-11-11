import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../utils/formatTime';

interface Props {
  label: string;
  peaks: Uint8Array | null;
  duration: number;
  position: number; // giây
  canSeek: boolean;
  playing: boolean;
  height?: number;
  onSeek: (seconds: number) => void;
}

/** Sóng âm + đầu phát. Bấm hoặc kéo để tua (chỉ khi đang phát/tạm dừng). Bàn phím: ←/→ 1s, Shift 5s. */
export function Waveform({ label, peaks, duration, position, canSeek, playing, height = 44, onSeek }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? position;
  const ratio = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0;

  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(box.clientWidth));
    cv.width = w * dpr;
    cv.height = height * dpr;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);
    const cs = getComputedStyle(box);
    const played = cs.getPropertyValue('--wf-played').trim() || '#38bdf8';
    const rest = cs.getPropertyValue('--wf-rest').trim() || '#64748b';
    const n = peaks?.length ?? 0;
    const bars = n > 0 ? Math.min(n, Math.floor(w / 3)) : 0;
    const mid = height / 2;
    if (bars === 0) {
      g.fillStyle = rest;
      g.fillRect(0, mid - 1, w, 2); // chưa có sóng: đường phẳng
    } else {
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const from = Math.floor((i * n) / bars);
        const to = Math.max(from + 1, Math.floor(((i + 1) * n) / bars));
        let p = 0;
        for (let k = from; k < to; k++) p = Math.max(p, peaks![k]);
        const h = Math.max(2, (p / 255) * (height - 4));
        g.fillStyle = (i + 0.5) / bars <= ratio ? played : rest;
        g.fillRect(i * bw + 0.5, mid - h / 2, Math.max(1, bw - 1.5), h);
      }
    }
    if (canSeek || ratio > 0) {
      g.fillStyle = playing ? '#fbbf24' : '#e2e8f0';
      g.fillRect(Math.min(w - 2, Math.max(0, ratio * w - 1)), 0, 2, height);
    }
  }, [peaks, ratio, height, canSeek, playing]);

  const toSeconds = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / Math.max(1, r.width)) * duration));
  };

  return (
    <div
      ref={wrap}
      role="slider"
      tabIndex={canSeek ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(duration))}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatTime(shown)} / ${formatTime(duration)}`}
      aria-disabled={!canSeek}
      className={`wf relative w-full select-none rounded-md bg-stage-900/70 ${canSeek ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
      style={{ height, touchAction: 'none' }}
      onPointerDown={(e) => {
        if (!canSeek) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag(toSeconds(e.clientX));
      }}
      onPointerMove={(e) => {
        if (drag !== null) setDrag(toSeconds(e.clientX));
      }}
      onPointerUp={(e) => {
        if (drag !== null) {
          onSeek(toSeconds(e.clientX));
          setDrag(null);
        }
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (!canSeek) return;
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, position + step));
        else if (e.key === 'ArrowLeft') onSeek(Math.max(0, position - step));
        else return;
        e.preventDefault();
      }}
    >
      <canvas ref={canvas} style={{ width: '100%', height }} className="block" />
    </div>
  );
}
