import { memo } from 'react';
import { useWaveform } from '../hooks/useWaveform';
import { Waveform } from './Waveform';
import type { PlaybackStatus, SoundDocument, TrackRuntimeState } from '../types/sound';
import { formatTime } from '../utils/formatTime';

export interface AudioActions {
  toggle(id: string): void;
  stop(id: string): void;
  replay(id: string): void;
  seek(id: string, seconds: number): void;
  setVolume(id: string, volume: number): void;
  setLoop(id: string, loop: boolean): void;
  retry(id: string): void;
}

interface Props {
  sound: SoundDocument;
  track: TrackRuntimeState | undefined;
  online: boolean;
  isAdmin: boolean;
  isActiveBgm: boolean;
  /** Kiểu gọn (BGM cố định trên đầu). */
  compact?: boolean;
  /** Thuộc đoạn đang chọn. */
  inScene?: boolean;
  actions: AudioActions;
  onEdit?: (sound: SoundDocument) => void;
  onDelete?: (sound: SoundDocument) => void;
}

const STATUS_LABEL: Record<PlaybackStatus, string> = {
  idle: 'Idle',
  loading: 'Loading',
  ready: 'Ready',
  playing: 'Playing',
  paused: 'Paused',
  ended: 'Ended',
  error: 'Error',
};

const STATUS_STYLE: Record<PlaybackStatus, string> = {
  idle: 'bg-stage-700 text-slate-300',
  loading: 'bg-amber-500/20 text-amber-300',
  ready: 'bg-emerald-500/15 text-emerald-300',
  playing: 'bg-sky-500 text-slate-950',
  paused: 'bg-amber-400 text-slate-950',
  ended: 'bg-stage-700 text-slate-300',
  error: 'bg-red-600 text-white',
};

function AudioItemImpl({ sound, track, online, isAdmin, isActiveBgm, compact = false, inScene = false, actions, onEdit, onDelete }: Props) {
  const status: PlaybackStatus = track?.playbackStatus ?? 'idle';
  const duration = track?.durationSeconds ?? sound.durationSeconds;
  const seekSeconds = track?.seekSeconds ?? 0;
  const volume = track?.volume ?? sound.defaultVolume;
  const loop = track?.loop ?? sound.loopDefault;

  const peaks = useWaveform(sound.storagePath);

  const isLoaded = status === 'ready' || status === 'playing' || status === 'paused' || status === 'ended';
  const offlineBlocked = !online && !isLoaded; // chưa preload mà mất mạng
  const canToggle = !!track && status !== 'loading' && status !== 'error' && !offlineBlocked;
  const canSeek = (status === 'playing' || status === 'paused') && Number.isFinite(duration) && duration > 0;
  const canStop = status === 'playing' || status === 'paused' || status === 'loading' || status === 'ended';
  const canReplay = !!track && status !== 'error' && status !== 'loading' && !offlineBlocked;

  const shownSeek = seekSeconds;
  const playing = status === 'playing';

  const ctl = compact ? 'btn h-9 min-w-9 px-2 text-sm bg-stage-700 hover:bg-stage-600' : 'btn-ctl';
  const statusText =
    status === 'loading'
      ? track?.loadPhase === 'decoding'
        ? 'Decoding'
        : 'Downloading'
      : offlineBlocked
        ? 'Not ready / Offline'
        : STATUS_LABEL[status];

  return (
    <li
      data-testid={`audio-item-${sound.id}`}
      className={`rounded-xl border ${compact ? 'p-3 space-y-2' : 'p-4 space-y-3'} ${
        playing ? 'border-sky-400 bg-sky-500/10' : isActiveBgm ? 'border-amber-400/70 bg-stage-800' : inScene ? 'border-amber-300/50 bg-stage-800 ring-1 ring-amber-300/30' : 'border-stage-600 bg-stage-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-base truncate" title={sound.title}>
            {sound.title}
            {isActiveBgm && (
              <span className="ml-2 align-middle rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-950">
                BGM đang chọn
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 truncate" title={sound.originalFilename}>
            {sound.scene} · {sound.originalFilename}
          </p>
        </div>
        <span
          data-testid="status-badge"
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
            offlineBlocked ? 'bg-red-900/60 text-red-200' : STATUS_STYLE[status]
          }`}
        >
          {statusText}
        </span>
      </div>

      <div className={`flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          className={`btn ${compact ? 'h-9 min-w-20 px-3 text-sm' : 'h-12 min-w-24 px-4 text-lg'} ${playing ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-sky-600 hover:bg-sky-500'}`}
          disabled={!canToggle}
          onClick={() => actions.toggle(sound.id)}
          aria-label={playing ? `Tạm dừng ${sound.title}` : `Phát ${sound.title}`}
        >
          {playing ? '⏸ Pause' : status === 'paused' ? '▶ Resume' : '▶ Play'}
        </button>
        <button
          type="button"
          className={ctl}
          disabled={!canStop}
          onClick={() => actions.stop(sound.id)}
          aria-label={`Dừng ${sound.title}`}
        >
          ⏹ Stop
        </button>
        <button
          type="button"
          className={ctl}
          disabled={!canReplay}
          onClick={() => actions.replay(sound.id)}
          aria-label={`Phát lại ${sound.title}`}
        >
          ↺ Replay
        </button>
        <button
          type="button"
          className={`${ctl} ${loop ? '!bg-emerald-600 hover:!bg-emerald-500' : ''}`}
          aria-pressed={loop}
          onClick={() => actions.setLoop(sound.id, !loop)}
          aria-label={`Lặp ${sound.title}`}
        >
          ⟲ {compact ? '' : 'Loop '}{loop ? 'On' : 'Off'}
        </button>
        {status === 'error' && (
          <button type="button" className="btn-ctl !bg-red-700 hover:!bg-red-600" onClick={() => actions.retry(sound.id)}>
            Retry
          </button>
        )}
      </div>

      {status === 'error' && track?.errorMessage && (
        <p role="alert" className="text-sm text-red-300">
          {track.errorMessage}
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-300">{formatTime(shownSeek)}</span>
        <div className="min-w-0 flex-1">
          <Waveform
            label={`Vị trí phát ${sound.title}`}
            peaks={peaks}
            duration={canSeek ? duration : Math.max(duration, 0)}
            position={shownSeek}
            canSeek={canSeek}
            playing={playing}
            height={compact ? 28 : 48}
            onSeek={(sec) => actions.seek(sound.id, sec)}
          />
        </div>
        <span className="w-12 font-mono text-xs tabular-nums text-slate-400">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-14">Vol {Math.round(volume * 100)}%</span>
        <input
          type="range"
          aria-label={`Âm lượng ${sound.title}`}
          className="flex-1 h-8"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(e) => actions.setVolume(sound.id, Number(e.target.value) / 100)}
        />
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" className="btn h-9 px-3 text-sm bg-stage-700 hover:bg-stage-600" onClick={() => onEdit?.(sound)}>
              Sửa
            </button>
            <button
              type="button"
              className="btn h-9 px-3 text-sm bg-red-900/70 hover:bg-red-800 text-red-100"
              onClick={() => onDelete?.(sound)}
            >
              Xóa
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export const AudioItem = memo(AudioItemImpl);
