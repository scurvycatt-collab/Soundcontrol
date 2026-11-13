import type { FieldValue, Timestamp } from 'firebase/firestore';

export type SoundCategory = 'BGM' | 'SFX';
export type StoredSoundStatus = 'ready' | 'deleting' | 'error';
export type PlaybackStatus =
  | 'idle' | 'loading' | 'ready' | 'playing'
  | 'paused' | 'ended' | 'error';

export interface SoundDocument {
  id: string; // Firestore doc ID, trùng field `id`
  title: string;
  scene: string;
  sceneOrder: number;
  sortOrder: number;
  category: SoundCategory;
  storagePath: string; // sounds/{id}/{uuid}.{ext}
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  defaultVolume: number; // 0..1
  loopDefault: boolean;
  /** Cắt không phá hủy: chỉ phát từ trimStart đến trimEnd (giây trong file gốc). trimEnd = 0/vắng mặt: đến hết file. */
  trimStart?: number;
  trimEnd?: number;
  /** Tốc độ phát mặc định (0.5–2, mặc định 1). Đổi tốc độ cũng đổi cao độ. */
  playbackRate?: number;
  /** Fade in / fade out (giây thực, 0/vắng mặt = tắt). */
  fadeIn?: number;
  fadeOut?: number;
  status: StoredSoundStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUid: string;
}

/** Dữ liệu ghi lần đầu: timestamp do server điền. */
export type SoundCreateData = Omit<SoundDocument, 'createdAt' | 'updatedAt'> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
};

/** Các trường admin được sửa (khớp Security Rules). */
export interface SoundMetadataPatch {
  title: string;
  scene: string;
  sceneOrder: number;
  sortOrder: number;
  category: SoundCategory;
  defaultVolume: number;
  loopDefault: boolean;
  trimStart: number; // 0 = từ đầu
  trimEnd: number; // 0 = đến hết
  playbackRate: number; // 1 = bình thường
  fadeIn: number; // giây, 0 = tắt
  fadeOut: number;
}

export type LoadPhase = 'downloading' | 'decoding';

export interface TrackRuntimeState {
  soundId: string;
  playbackStatus: PlaybackStatus;
  seekSeconds: number;
  durationSeconds: number;
  volume: number; // 0..1, độc lập với master
  loop: boolean;
  /** Tốc độ đang áp dụng (người vận hành đổi tạm thời được, như volume). */
  rate: number;
  /** Vị trí bắt đầu của đoạn cắt trong file gốc (giây). seekSeconds/durationSeconds tính theo đoạn cắt. */
  windowStartSeconds: number;
  /** Độ dài toàn bộ file gốc (giây), để vẽ sóng âm. */
  fileDurationSeconds: number;
  loadPhase?: LoadPhase;
  errorMessage?: string;
}
