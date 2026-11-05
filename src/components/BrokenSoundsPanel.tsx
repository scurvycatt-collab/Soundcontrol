import { useState } from 'react';
import { clearOrphan, listOrphans, type OrphanRecord } from '../services/diagnostics';
import { deleteStorageFile } from '../services/soundRepository';
import type { SoundDocument } from '../types/sound';

interface Props {
  broken: readonly SoundDocument[];
  invalid: readonly { id: string; reason: string }[];
  onRetryDelete: (s: SoundDocument) => Promise<string | null>;
}

/** Chỉ admin thấy: bản ghi xóa dở/lỗi, document sai cấu trúc và file Storage có thể mồ côi. */
export function BrokenSoundsPanel({ broken, invalid, onRetryDelete }: Props) {
  const [orphans, setOrphans] = useState<OrphanRecord[]>(() => listOrphans());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (broken.length === 0 && invalid.length === 0 && orphans.length === 0) return null;

  return (
    <section aria-label="Cần xử lý" className="mx-auto max-w-7xl px-4 pt-4">
      <div className="space-y-3 rounded-xl border border-red-500/50 bg-red-900/10 p-4">
        <h2 className="font-bold text-red-200">Cần xử lý (chỉ admin)</h2>
        {msg && <p role="alert" className="text-sm text-red-300">{msg}</p>}

        {broken.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex-1">
              <strong>{s.title}</strong> — trạng thái <code>{s.status}</code> (không được phát). {s.storagePath}
            </span>
            <button
              type="button"
              className="btn h-9 px-3 bg-red-700 hover:bg-red-600"
              disabled={busyId === s.id}
              onClick={async () => {
                setBusyId(s.id);
                setMsg(await onRetryDelete(s));
                setBusyId(null);
                setOrphans(listOrphans());
              }}
            >
              {busyId === s.id ? 'Đang xóa…' : 'Retry xóa'}
            </button>
          </div>
        ))}

        {invalid.map((i) => (
          <p key={i.id} className="text-sm text-amber-200">
            Document <code>{i.id}</code> sai cấu trúc (trường: {i.reason}) — đã bỏ qua, hãy sửa/xóa trong Firebase Console.
          </p>
        ))}

        {orphans.map((o) => (
          <div key={o.path} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex-1">
              File có thể mồ côi: <code>{o.path}</code> <span className="text-slate-400">({o.reason})</span>
            </span>
            <button
              type="button"
              className="btn h-9 px-3 bg-stage-700 hover:bg-stage-600"
              onClick={async () => {
                try {
                  await deleteStorageFile(o.path);
                  clearOrphan(o.path);
                  setMsg(null);
                } catch (e) {
                  setMsg(`Không xóa được ${o.path}: ${e instanceof Error ? e.message : String(e)}`);
                }
                setOrphans(listOrphans());
              }}
            >
              Xóa file
            </button>
            <button
              type="button"
              className="btn h-9 px-3 bg-stage-700 hover:bg-stage-600"
              onClick={() => {
                clearOrphan(o.path);
                setOrphans(listOrphans());
              }}
            >
              Bỏ qua
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
