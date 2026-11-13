import type { DuckSettings } from '../audio/types';

interface Props {
  duck: DuckSettings;
  onChange(next: Partial<DuckSettings>): void;
}

/** Tự giảm BGM khi SFX đang phát; level = % âm lượng BGM còn lại khi bị giảm. */
export function DuckControl({ duck, onChange }: Props) {
  const pct = Math.round(duck.level * 100);
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="duck-control">
      <label className="flex cursor-pointer items-center gap-1.5 font-semibold" title="Khi có SFX phát, BGM tự nhỏ lại rồi trả về từ từ khi SFX hết">
        <input type="checkbox" checked={duck.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        Giảm BGM khi có SFX
      </label>
      {duck.enabled && (
        <label className="flex items-center gap-1.5 text-slate-300">
          <span className="whitespace-nowrap">còn {pct}%</span>
          <input
            type="range"
            aria-label="BGM còn lại khi có SFX (%)"
            className="h-6 w-24"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => onChange({ level: Number(e.target.value) / 100 })}
          />
        </label>
      )}
    </div>
  );
}
