import { ALL_SEGMENTS, getSegment } from '../data/script';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MAX_UPLOAD_MB } from '../config';
import { startUpload, type UploadHandle } from '../services/uploadService';
import type { SoundCategory } from '../types/sound';
import { formatBytes } from '../utils/formatTime';
import { validateAudioFile } from '../utils/validateAudio';

interface Props {
  uid: string;
  scenes: string[];
  /** Đoạn đang chọn ở màn hình chính (điền sẵn). */
  defaultScene?: string;
  onClose: () => void;
  onUploaded: (title: string) => void;
}

export function UploadModal({ uid, scenes, defaultScene = '', onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [scene, setScene] = useState(defaultScene || scenes[0] || ALL_SEGMENTS[0]?.id || 'Cảnh 1');
  const [sceneOrder, setSceneOrder] = useState(getSegment(defaultScene || scenes[0] || '')?.order ?? 1);
  const [sortOrder, setSortOrder] = useState(1);
  const [category, setCategory] = useState<SoundCategory>('SFX');
  const [volumePct, setVolumePct] = useState(100);
  const [loopDefault, setLoopDefault] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);

  const segmentOptions = useMemo(() => [...ALL_SEGMENTS.map((x) => x.id), ...scenes.filter((x) => !getSegment(x))], [scenes]);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Đóng modal giữa chừng = hủy upload.
  useEffect(() => () => handleRef.current?.cancel(), []);

  const onFile = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    const check = validateAudioFile(f);
    if (!check.ok) {
      setFile(null);
      setError(check.message);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    const handle = startUpload(
      { file, title, scene, sceneOrder, sortOrder, category, defaultVolume: volumePct / 100, loopDefault, uid },
      setProgress,
    );
    handleRef.current = handle;
    const outcome = await handle.promise;
    handleRef.current = null;
    setBusy(false);
    if (outcome.ok) {
      onUploaded(title.trim());
      onClose();
    } else if (outcome.reason !== 'cancelled') {
      setError(outcome.message);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/70 px-4 pb-4 pt-16" role="dialog" aria-modal="true" aria-label="Thêm âm thanh">
      <form onSubmit={onSubmit} className="w-full max-w-lg space-y-3 rounded-xl border border-stage-600 bg-stage-800 p-5">
        <h2 className="text-lg font-bold">Thêm âm thanh</h2>

        <label className="block text-sm">
          Tệp âm thanh (.mp3 / .wav, tối đa {MAX_UPLOAD_MB} MiB)
          <input
            type="file"
            accept=".mp3,.wav,.MP3,.WAV,audio/mpeg,audio/wav"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="field mt-1"
          />
        </label>
        {file && (
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              {file.name} · {formatBytes(file.size)}
            </p>
            {previewUrl && <audio controls src={previewUrl} className="w-full" preload="metadata" />}
          </div>
        )}

        <label className="block text-sm">
          Tên âm thanh
          <input
            list="cue-options"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              const cue = getSegment(scene)?.cues.find((c) => c.name === e.target.value);
              if (cue) setCategory(cue.category); // chọn đúng cue của kịch bản thì tự đặt nhóm BGM/SFX
            }}
            maxLength={120}
            required
            disabled={busy}
            className="field mt-1"
          />
          <datalist id="cue-options">
            {(getSegment(scene)?.cues ?? []).map((c) => (
              <option key={c.name} value={c.name} label={c.category} />
            ))}
          </datalist>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Cảnh kịch
            <input list="scene-options" value={scene} onChange={(e) => {
                setScene(e.target.value);
                const seg = getSegment(e.target.value);
                if (seg) setSceneOrder(seg.order); // thứ tự đoạn theo kịch bản
              }} maxLength={80} required disabled={busy} className="field mt-1" />
            <datalist id="scene-options">
              {segmentOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            Nhóm
            <select value={category} onChange={(e) => setCategory(e.target.value as SoundCategory)} disabled={busy} className="field mt-1">
              <option value="BGM">BGM (nhạc nền)</option>
              <option value="SFX">SFX (hiệu ứng)</option>
            </select>
          </label>
          <label className="block text-sm">
            Thứ tự cảnh
            <input type="number" min={0} step={1} value={sceneOrder} onChange={(e) => setSceneOrder(Number(e.target.value))} disabled={busy} className="field mt-1" />
          </label>
          <label className="block text-sm">
            Thứ tự trong cảnh
            <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} disabled={busy} className="field mt-1" />
          </label>
        </div>

        <label className="block text-sm">
          Âm lượng mặc định: {volumePct}%
          <input type="range" min={0} max={100} value={volumePct} onChange={(e) => setVolumePct(Number(e.target.value))} disabled={busy} className="mt-1 w-full" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={loopDefault} onChange={(e) => setLoopDefault(e.target.checked)} disabled={busy} />
          Lặp lại mặc định
        </label>

        {busy && (
          <div aria-label="Tiến độ upload">
            <div className="h-2 overflow-hidden rounded bg-stage-950">
              <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">Đang upload… {Math.round(progress * 100)}%</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn h-10 px-4 bg-stage-700 hover:bg-stage-600"
            onClick={() => {
              if (busy) handleRef.current?.cancel();
              else onClose();
            }}
          >
            {busy ? 'Hủy upload' : 'Cancel'}
          </button>
          <button type="submit" className="btn h-10 px-4 bg-emerald-600 hover:bg-emerald-500" disabled={!file || busy}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
