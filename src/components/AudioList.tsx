import type { SoundDocument, TrackRuntimeState } from '../types/sound';
import { AudioItem, type AudioActions } from './AudioItem';

interface Props {
  title: string;
  subtitle: string;
  sounds: readonly SoundDocument[];
  tracks: Readonly<Record<string, TrackRuntimeState>>;
  activeBgmId: string | null;
  online: boolean;
  isAdmin: boolean;
  loading: boolean;
  actions: AudioActions;
  onEdit: (s: SoundDocument) => void;
  onDelete: (s: SoundDocument) => void;
}

export function AudioList({
  title, subtitle, sounds, tracks, activeBgmId, online, isAdmin, loading, actions, onEdit, onDelete,
}: Props) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">
          {title} <span className="ml-1 text-sm font-normal text-slate-400">({sounds.length})</span>
        </h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      {loading && sounds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stage-600 p-6 text-center text-slate-400">Đang tải danh sách…</p>
      ) : sounds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stage-600 p-6 text-center text-slate-400">
          Chưa có âm thanh nào{isAdmin ? ' — bấm “Add Sounds” để thêm.' : '.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {sounds.map((s) => (
            <AudioItem
              key={s.id}
              sound={s}
              track={tracks[s.id]}
              online={online}
              isAdmin={isAdmin}
              isActiveBgm={activeBgmId === s.id}
              actions={actions}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
