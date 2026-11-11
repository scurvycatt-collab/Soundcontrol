import { getSegment } from '../data/script';
import { useWaveform } from '../hooks/useWaveform';
import { TrimEditor } from './TrimEditor';
import { useState, type FormEvent } from 'react';
import type { SoundCategory, SoundDocument, SoundMetadataPatch } from '../types/sound';
import { validateMetadata } from '../utils/validateAudio';

interface Props {
  sound: SoundDocument;
  /** true nếu sound đang phát/tạm dừng: đổi nhóm sẽ dừng nó. */
  isActive: boolean;
  /** Độ dài file gốc (giây) nếu engine đã đo được; nếu không dùng durationSeconds của metadata. */
  fileDuration?: number;
  onSave: (patch: SoundMetadataPatch) => Promise<void>;
  onClose: () => void;
}

export function EditSoundModal({ sound, isActive, fileDuration: measured, onSave, onClose }: Props) {
  const fileDuration = measured && measured > 0 ? measured : sound.durationSeconds;
  const peaks = useWaveform(sound.storagePath);
  const [title, setTitle] = useState(sound.title);
  const [scene, setScene] = useState(sound.scene);
  const [sceneOrder, setSceneOrder] = useState(sound.sceneOrder);
  const [sortOrder, setSortOrder] = useState(sound.sortOrder);
  const [category, setCategory] = useState<SoundCategory>(sound.category);
  const [volumePct, setVolumePct] = useState(Math.round(sound.defaultVolume * 100));
  const [loopDefault, setLoopDefault] = useState(sound.loopDefault);
  const [trimStart, setTrimStart] = useState(sound.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState(sound.trimEnd && sound.trimEnd > 0 ? Math.min(sound.trimEnd, fileDuration) : fileDuration);
  const [rate, setRate] = useState(sound.playbackRate ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryChanges = category !== sound.category && isActive;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const patch: SoundMetadataPatch = {
      title: title.trim(),
      scene: scene.trim(),
      sceneOrder,
      sortOrder,
      category,
      defaultVolume: volumePct / 100,
      loopDefault,
      // Không cắt => lưu 0/0 (đến hết file) để khớp Rules và không giữ số liệu thừa.
      trimStart: trimStart > 0.001 ? Math.round(trimStart * 1000) / 1000 : 0,
      trimEnd: trimEnd < fileDuration - 0.001 ? Math.round(trimEnd * 1000) / 1000 : 0,
      playbackRate: Math.round(rate * 100) / 100,
    };
    const invalid = validateMetadata({ ...patch, fileDuration });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/70 px-4 pb-4 pt-16" role="dialog" aria-modal="true" aria-label="Sửa âm thanh">
      <form onSubmit={submit} className="w-full max-w-xl space-y-3 rounded-xl border border-stage-600 bg-stage-800 p-5">
        <h2 className="text-lg font-bold">Sửa metadata</h2>
        <p className="text-xs text-slate-400">Tệp: {sound.originalFilename} (không đổi tệp ở đây)</p>
        <label className="block text-sm">
          Tên âm thanh
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="field mt-1" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Cảnh kịch
            <input
              value={scene}
              onChange={(e) => {
                setScene(e.target.value);
                const seg = getSegment(e.target.value);
                if (seg) setSceneOrder(seg.order);
              }}
              maxLength={80}
              className="field mt-1"
            />
          </label>
          <label className="block text-sm">
            Nhóm
            <select value={category} onChange={(e) => setCategory(e.target.value as SoundCategory)} className="field mt-1">
              <option value="BGM">BGM</option>
              <option value="SFX">SFX</option>
            </select>
          </label>
          <label className="block text-sm">
            Thứ tự cảnh
            <input type="number" min={0} step={1} value={sceneOrder} onChange={(e) => setSceneOrder(Number(e.target.value))} className="field mt-1" />
          </label>
          <label className="block text-sm">
            Thứ tự trong cảnh
            <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="field mt-1" />
          </label>
        </div>
        <label className="block text-sm">
          Âm lượng mặc định: {volumePct}%
          <input type="range" min={0} max={100} value={volumePct} onChange={(e) => setVolumePct(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={loopDefault} onChange={(e) => setLoopDefault(e.target.checked)} />
          Lặp lại mặc định
        </label>
        {fileDuration > 0 ? (
          <TrimEditor
            storagePath={sound.storagePath}
            fileDuration={fileDuration}
            peaks={peaks}
            start={trimStart}
            end={trimEnd}
            onChange={(a, b) => {
              setTrimStart(a);
              setTrimEnd(b);
            }}
            rate={rate}
            onRate={setRate}
            previewVolume={volumePct / 100}
            locked={isActive}
          />
        ) : (
          <p className="text-sm text-slate-400">Chưa biết độ dài file nên chưa thể cắt.</p>
        )}
        {categoryChanges && (
          <p role="status" className="text-sm text-amber-300">
            Âm thanh này đang phát. Đổi nhóm BGM/SFX sẽ DỪNG nó trước khi lưu.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn h-10 px-4 bg-stage-700 hover:bg-stage-600" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn h-10 px-4 bg-emerald-600 hover:bg-emerald-500" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
