import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, children, confirmLabel, danger, busy, error, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 pb-4 pt-16" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md space-y-4 rounded-xl border border-stage-600 bg-stage-800 p-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="text-sm text-slate-300">{children}</div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn h-10 px-4 bg-stage-700 hover:bg-stage-600" onClick={onCancel} disabled={busy}>
            Hủy
          </button>
          <button
            type="button"
            className={`btn h-10 px-4 ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
