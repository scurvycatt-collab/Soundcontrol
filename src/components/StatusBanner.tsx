export interface BannerItem {
  key: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

const STYLE = {
  info: 'border-sky-500/50 bg-sky-500/10 text-sky-100',
  warn: 'border-amber-400/60 bg-amber-400/10 text-amber-100',
  error: 'border-red-500/70 bg-red-600/15 text-red-100',
} as const;

export function StatusBanner({ items }: { items: BannerItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mx-auto max-w-7xl space-y-2 px-4 pt-3" aria-live="polite">
      {items.map((it) => (
        <div
          key={it.key}
          role={it.level === 'error' ? 'alert' : 'status'}
          className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2 text-sm ${STYLE[it.level]}`}
        >
          <span className="flex-1">{it.message}</span>
          {it.actionLabel && (
            <button type="button" className="btn h-8 px-3 text-xs bg-stage-700 hover:bg-stage-600" onClick={it.onAction}>
              {it.actionLabel}
            </button>
          )}
          {it.onDismiss && (
            <button type="button" aria-label="Đóng thông báo" className="btn h-8 w-8 text-xs bg-stage-700 hover:bg-stage-600" onClick={it.onDismiss}>
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
