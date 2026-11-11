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
  compact?: boolean;
  hideHeading?: boolean;
  /** Cue thuộc đoạn đang chọn (làm nổi bật trong dock BGM). */
  highlightScene?: string;
  actions: AudioActions;
  onEdit: (s: SoundDocument) => void;
  onDelete: (s: SoundDocument) => void;
}

export function AudioList({
  title, subtitle, sounds, tracks, activeBgmId, online, isAdmin, loading, compact = false, hideHeading = false, highlightScene = '', actions, onEdit, onDelete,
}: Props) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className={`mb-3 flex items-baseline justify-between ${hideHeading ? 'sr-only' : ''}`}>
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
        <ul className={compact ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'grid gap-3 xl:grid-cols-2'}>
          {sounds.map((s) => (
            <AudioItem
              key={s.id}
              sound={s}
              track={tracks[s.id]}
              online={online}
              isAdmin={isAdmin}
              isActiveBgm={activeBgmId === s.id}
              compact={compact}
              inScene={!!highlightScene && s.scene === highlightScene}
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
