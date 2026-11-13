import { memo } from 'react';
import { useWaveform } from '../hooks/useWaveform';
import { Waveform } from './Waveform';
import type { PlaybackStatus, SoundDocument, TrackRuntimeState } from '../types/sound';
import { formatTime } from '../utils/formatTime';
import { RATE_PRESETS, realSeconds } from '../utils/trim';

export interface AudioActions {
  toggle(id: string): void;
  stop(id: string): void;
  replay(id: string): void;
  seek(id: string, seconds: number): void;
  setVolume(id: string, volume: number): void;
  setLoop(id: string, loop: boolean): void;
  setRate(id: string, rate: number): void;
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
  const rate = track?.rate ?? sound.playbackRate ?? 1;
  const winStart = track?.windowStartSeconds ?? sound.trimStart ?? 0;
  const fileDuration = track?.fileDurationSeconds ?? sound.durationSeconds;
  const winEnd = winStart + duration;
  const trimmed = winStart > 0.001 || (fileDuration > 0 && winEnd < fileDuration - 0.001);
  const defaultRate = sound.playbackRate ?? 1;
  const fadeIn = sound.fadeIn ?? 0;
  const fadeOut = sound.fadeOut ?? 0;
  const rateOptions = RATE_PRESETS.some((r) => Math.abs(r - rate) < 0.001) ? [...RATE_PRESETS] : [...RATE_PRESETS, rate].sort((a, b) => a - b);

  const peaks = useWaveform(sound.storagePath);

  const isLoaded = status === 'ready' || status === 'playing' || status === 'paused' || status === 'ended';
  const offlineBlocked = !online && !isLoaded; // chưa preload mà mất mạng
  const canToggle = !!track && status !== 'loading' && status !== 'error' && !offlineBlocked;
  const canSeek = (status === 'playing' || status === 'paused') && Number.isFinite(duration) && duration > 0;
  const canStop = status === 'playing' || status === 'paused' || status === 'loading' || status === 'ended';
  const canReplay = !!track && status !== 'error' && status !== 'loading' && !offlineBlocked;

  const shownSeek = seekSeconds;
  const playing = status === 'playing';

  const ctl = compact ? 'btn h-9 min-w-9 px-2 text-sm bg-stage-700 hover:bg-stage-600' : 'btn h-10 min-w-10 px-2.5 text-sm bg-stage-700 hover:bg-stage-600';
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
      className={`rounded-xl border ${compact ? 'p-3 space-y-2' : 'p-3 space-y-2'} ${
        playing ? 'border-sky-400 bg-sky-500/10' : isActiveBgm ? 'border-amber-400/70 bg-stage-800' : inScene ? 'border-amber-300/50 bg-stage-800 ring-1 ring-amber-300/30' : 'border-stage-600 bg-stage-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate" title={sound.title}>
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
          {(trimmed || Math.abs(rate - 1) > 0.001 || fadeIn > 0 || fadeOut > 0) && (
            <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {trimmed && (
                <span className="rounded bg-amber-300/15 px-1.5 py-0.5 text-amber-200" title="Đã cắt: chỉ phát đoạn này của file gốc">
                  ✂ {winStart.toFixed(2)}–{winEnd.toFixed(2)}s
                </span>
              )}
              {(fadeIn > 0 || fadeOut > 0) && (
                <span className="rounded bg-teal-300/15 px-1.5 py-0.5 text-teal-200" title="Fade in / fade out (giây)">
                  ◢ {fadeIn > 0 ? `${fadeIn}s` : '—'} · {fadeOut > 0 ? `${fadeOut}s` : '—'} ◣
                </span>
              )}
              {Math.abs(rate - 1) > 0.001 && (
                <span className="rounded bg-fuchsia-400/15 px-1.5 py-0.5 text-fuchsia-200" title="Tốc độ phát (đổi cả cao độ)">
                  ×{rate.toFixed(2)}
                </span>
              )}
            </p>
          )}
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
          className={`btn ${compact ? 'h-9 min-w-20 px-3 text-sm' : 'h-10 min-w-20 px-3 text-base'} ${playing ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-sky-600 hover:bg-sky-500'}`}
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
        <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-300">{formatTime(realSeconds(shownSeek, rate))}</span>
        <div className="min-w-0 flex-1">
          <Waveform
            label={`Vị trí phát ${sound.title}`}
            peaks={peaks}
            duration={fileDuration > 0 ? fileDuration : Math.max(duration, 0)}
            position={winStart + shownSeek}
            windowStart={winStart}
            windowEnd={winEnd}
            canSeek={canSeek}
            playing={playing}
            height={compact ? 28 : 38}
            onSeek={(abs) => actions.seek(sound.id, Math.min(duration, Math.max(0, abs - winStart)))}
          />
        </div>
        <span className="w-12 font-mono text-xs tabular-nums text-slate-400">{formatTime(realSeconds(duration, rate))}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-slate-400 w-14">Vol {Math.round(volume * 100)}%</span>
        <input
          type="range"
          aria-label={`Âm lượng ${sound.title}`}
          className="h-8 min-w-24 flex-1 basis-24"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(e) => actions.setVolume(sound.id, Number(e.target.value) / 100)}
        />
        <label className="flex items-center gap-1 text-xs text-slate-400" title="Tốc độ phát tạm thời (đổi cả cao độ). Đặt mặc định trong “Sửa”.">
          <span className="sr-only">{`Tốc độ ${sound.title}`}</span>
          <span aria-hidden>⏩</span>
          <select
            aria-label={`Tốc độ ${sound.title}`}
            value={rate}
            onChange={(e) => actions.setRate(sound.id, Number(e.target.value))}
            className="h-9 rounded-md border border-stage-600 bg-stage-950 px-1 text-sm text-slate-100"
          >
            {rateOptions.map((r) => (
              <option key={r} value={r}>
                ×{Number.isInteger(r) ? r.toFixed(1) : r}
              </option>
            ))}
          </select>
          {Math.abs(rate - defaultRate) > 0.001 && (
            <button type="button" className="btn h-9 px-2 text-xs bg-stage-700 hover:bg-stage-600" onClick={() => actions.setRate(sound.id, defaultRate)} aria-label={`Đặt lại tốc độ ${sound.title}`}>
              ↺
            </button>
          )}
        </label>
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
