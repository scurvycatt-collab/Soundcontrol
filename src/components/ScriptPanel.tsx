import { getSegment, sceneOfSegment } from '../data/script';
import type { SoundDocument } from '../types/sound';
import { findSoundForCue } from '../utils/segments';

interface Props {
  segmentId: string;
  sounds: readonly SoundDocument[];
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm text-slate-100">{children}</dd>
  </div>
);

/** Thông tin kịch bản của đoạn đang chọn + danh sách âm cần có (có file chưa). */
export function ScriptPanel({ segmentId, sounds }: Props) {
  const seg = getSegment(segmentId);
  const scene = sceneOfSegment(segmentId);
  if (!seg || !scene) return null;
  const hasDialogue = seg.dialogue.toLowerCase().startsWith('có');

  return (
    <section aria-label={`Kịch bản ${seg.id}`} className="rounded-xl border border-amber-300/40 bg-stage-800 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-extrabold text-amber-300">{seg.id}</h2>
        <p className="text-xs text-slate-400">
          Cảnh {scene.number}: {scene.title}
        </p>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${hasDialogue ? 'bg-rose-500 text-white' : 'bg-stage-700 text-slate-300'}`}
          title="Cột “Có thoại?” của kịch bản"
        >
          {hasDialogue ? '🎤 Có thoại' : 'Không thoại'}
        </span>
      </div>
      {scene.note && <p className="mt-1 text-xs italic text-slate-400">Bối cảnh: {scene.note}</p>}
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{seg.content}</p>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Nhân vật">{seg.characters || '—'}</Field>
        <Field label="Người cầm mic">{seg.mic || '—'}</Field>
        <Field label="Đạo cụ">{seg.props || '—'}</Field>
        <Field label="Âm thanh & hiệu ứng (kịch bản)">{seg.soundNote || '—'}</Field>
      </dl>

      {seg.cues.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cue cần có trong đoạn này</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {seg.cues.map((c) => {
              const found = findSoundForCue(c, seg.id, sounds);
              return (
                <li
                  key={`${c.category}-${c.name}`}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${found ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}
                  title={found ? `Đã có file: ${found.title}` : 'Chưa có file. Bấm “Add Sounds”, đặt tên giống cue và chọn đúng đoạn.'}
                >
                  {found ? '✓' : '✗'} {c.category} · {c.name}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
