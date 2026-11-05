import type { SoundCategory, TrackRuntimeState } from '../types/sound';

export type AudioFormat = 'mp3' | 'wav';

/** Phần metadata mà engine cần biết (không phụ thuộc Firestore/React). */
export interface TrackConfig {
  id: string;
  category: SoundCategory;
  format: AudioFormat;
  storagePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  defaultVolume: number;
  loopDefault: boolean;
}

export type EngineState = 'locked' | 'ready' | 'error';
export type NoticeLevel = 'info' | 'warn' | 'error';

export interface Notice {
  id: number;
  level: NoticeLevel;
  message: string;
}

export interface PrepareProgress {
  running: boolean;
  total: number;
  done: number;
  failed: number;
}

export interface PrepareResult {
  requested: number;
  ready: number;
  failed: string[];
  skipped: string[]; // vượt ngân sách bộ nhớ preload (dung lượng file hoặc RAM giải mã ước tính)
}

/** Ảnh chụp bất biến để React đọc qua useSyncExternalStore. */
export interface EngineSnapshot {
  engineState: EngineState;
  masterVolume: number;
  masterMuted: boolean;
  tracks: Readonly<Record<string, TrackRuntimeState>>;
  activeBgmId: string | null;
  pendingBgmId: string | null;
  activeSfxCount: number;
  anyPlaying: boolean;
  loadedBytes: number;
  /** Ước tính RAM giải mã của các cue đang nạp. */
  estimatedRamBytes: number;
  prepare: PrepareProgress;
  notice: Notice | null;
}

// ---- Trừu tượng hoá Howler để test được bằng mock ----

export interface HowlLike {
  play(id?: number): number;
  pause(id?: number): unknown;
  stop(id?: number): unknown;
  seek(pos?: number): unknown;
  volume(v: number): unknown;
  loop(l: boolean): unknown;
  duration(): number;
  unload(): unknown;
  off?(event?: string): unknown;
}

export interface HowlFactoryOptions {
  src: string;
  format: string;
  volume: number;
  loop: boolean;
  onload: () => void;
  onloaderror: (id: number | undefined, err: unknown) => void;
  onplay: (id: number) => void;
  onpause: (id: number) => void;
  onstop: (id: number) => void;
  onend: (id: number) => void;
  onplayerror: (id: number, err: unknown) => void;
}

export type HowlFactory = (options: HowlFactoryOptions) => HowlLike;
export type BlobProvider = (cfg: TrackConfig) => Promise<Blob>;

export interface EngineDeps {
  createHowl: HowlFactory;
  /** Gọi trong user gesture. Trả true nếu AudioContext đang chạy. */
  unlockContext: () => Promise<boolean>;
  getContextState: () => 'running' | 'suspended' | 'closed' | 'interrupted' | string;
  setMasterVolume: (v: number) => void;
  setMasterMute: (m: boolean) => void;
  playTestTone: () => void;
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export interface EngineOptions {
  maxActiveSfx?: number;
  maxPreloadBytes?: number;
  maxDecodedBytes?: number;
  tickMs?: number;
  preloadConcurrency?: number;
  initialMasterVolume?: number;
}
