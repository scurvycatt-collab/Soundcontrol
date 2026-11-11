import type { NavGroup } from '../utils/segments';
import { flattenNav } from '../utils/segments';

interface Props {
  groups: NavGroup[];
  selected: string; // '' = tất cả
  playingSegments: ReadonlySet<string>;
  onSelect: (id: string) => void;
}

/** Điều hướng theo phân đoạn: mỗi đoạn là một nhóm SFX. Chấm xanh = đang có âm phát trong đoạn đó. */
export function SegmentNav({ groups, selected, playingSegments, onSelect }: Props) {
  const ids = flattenNav(groups);
  const idx = ids.indexOf(selected);
  const go = (delta: number) => {
    if (ids.length === 0) return;
    const next = idx < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, idx + delta));
    onSelect(ids[next]);
  };

  return (
    <nav aria-label="Phân đoạn" className="min-w-0 rounded-xl border border-stage-600 bg-stage-800 p-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn h-11 bg-stage-700 hover:bg-stage-600 text-sm" disabled={idx <= 0 && idx !== -1} onClick={() => go(-1)}>
          ◀ Đoạn trước
        </button>
        <button type="button" className="btn h-11 bg-sky-700 hover:bg-sky-600 text-sm" disabled={idx === ids.length - 1} onClick={() => go(1)}>
          Đoạn sau ▶
        </button>
      </div>

      <button
        type="button"
        aria-pressed={selected === ''}
        onClick={() => onSelect('')}
        className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${selected === '' ? 'bg-sky-600 text-white' : 'bg-stage-700 hover:bg-stage-600'}`}
      >
        Tất cả đoạn
      </button>

      {groups.map((g) => (
        <div key={g.key} className="mb-2">
          <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.title}</p>
          <ul className="space-y-1">
            {g.segments.map((s) => {
              const active = selected === s.id;
              const playing = playingSegments.has(s.id);
              const complete = s.cueTotal > 0 && s.cueDone === s.cueTotal;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelect(s.id)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      active ? 'bg-amber-300 text-slate-950' : 'bg-stage-700/60 hover:bg-stage-600 text-slate-100'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.id}</span>
                    {playing && <span title="Đang phát" className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 ring-2 ring-emerald-400/40" />}
                    <span
                      title={s.cueTotal > 0 ? `${s.cueDone}/${s.cueTotal} cue theo kịch bản đã có file` : 'Không có trong kịch bản'}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        active ? 'bg-slate-950/15' : complete ? 'bg-emerald-500/20 text-emerald-300' : s.cueTotal > 0 ? 'bg-red-500/20 text-red-300' : 'bg-stage-600 text-slate-300'
                      }`}
                    >
                      {s.cueTotal > 0 ? `${s.cueDone}/${s.cueTotal}` : s.soundCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
