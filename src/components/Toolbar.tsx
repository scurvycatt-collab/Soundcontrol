import type { PrepareProgress } from '../audio/types';
import type { SortMode } from '../utils/soundDoc';
import { formatBytes } from '../utils/formatTime';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  scene: string;
  scenes: string[];
  onScene: (s: string) => void;
  sort: SortMode;
  onSort: (m: SortMode) => void;
  readyCount: number;
  totalCount: number;
  loadedBytes: number;
  estimatedRamBytes: number;
  prepare: PrepareProgress;
  online: boolean;
  isAdmin: boolean;
  onPrepareAll: () => void;
  onPrepareScene: () => void;
  onUnloadOthers: () => void;
  onAdd: () => void;
}

export function Toolbar(p: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stage-600 bg-stage-800 p-3">
        <label className="text-xs text-slate-400">
          Tìm theo tên
          <input
            type="search"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder="Tên, cảnh, tệp…"
            className="field mt-1 w-52"
          />
        </label>
        <label className="text-xs text-slate-400">
          Cảnh
          <select value={p.scene} onChange={(e) => p.onScene(e.target.value)} className="field mt-1 w-44">
            <option value="">Tất cả cảnh</option>
            {p.scenes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Sắp xếp
          <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortMode)} className="field mt-1 w-44">
            <option value="scene">Thứ tự cảnh / cue</option>
            <option value="name">Tên A–Z</option>
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn h-10 px-3 text-sm bg-sky-700 hover:bg-sky-600"
            disabled={!p.online || p.prepare.running}
            onClick={p.scene ? p.onPrepareScene : p.onPrepareAll}
            title={p.scene ? `Tải trước cảnh “${p.scene}”` : 'Tải trước tất cả cue'}
          >
            {p.prepare.running ? `Đang tải ${p.prepare.done}/${p.prepare.total}…` : p.scene ? 'Prepare Show (cảnh này)' : 'Prepare Show (tất cả)'}
          </button>
          {p.scene && (
            <button type="button" className="btn h-10 px-3 text-sm bg-stage-700 hover:bg-stage-600" disabled={!p.online || p.prepare.running} onClick={p.onPrepareAll}>
              Prepare tất cả
            </button>
          )}
          <button
            type="button"
            className="btn h-10 px-3 text-sm bg-stage-700 hover:bg-stage-600"
            onClick={p.onUnloadOthers}
            title="Giải phóng bộ nhớ các cue đã tải nhưng không nằm trong danh sách đang hiển thị (không đụng cue đang phát)"
          >
            Giải phóng bộ nhớ
          </button>
        </div>

        <p data-testid="prepare-status" className="ml-auto text-sm text-slate-300">
          Preparing show: <strong className="text-white">ready {p.readyCount}/{p.totalCount}</strong>
          <span className="ml-2 text-xs text-slate-400">({formatBytes(p.loadedBytes)} file · ≈{formatBytes(p.estimatedRamBytes)} RAM giải mã)</span>
          {p.prepare.failed > 0 && <span className="ml-2 text-xs text-red-300">{p.prepare.failed} lỗi</span>}
        </p>

        {p.isAdmin && (
          <button type="button" className="btn h-10 px-4 bg-emerald-600 hover:bg-emerald-500" onClick={p.onAdd}>
            ＋ Add Sounds
          </button>
        )}
      </div>
    </div>
  );
}
