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
}

export type LoadPhase = 'downloading' | 'decoding';

export interface TrackRuntimeState {
  soundId: string;
  playbackStatus: PlaybackStatus;
  seekSeconds: number;
  durationSeconds: number;
  volume: number; // 0..1, độc lập với master
  loop: boolean;
  loadPhase?: LoadPhase;
  errorMessage?: string;
}
