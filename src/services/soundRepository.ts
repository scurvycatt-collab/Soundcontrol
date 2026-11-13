import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, getBlob, ref } from 'firebase/storage';
import type { SoundCreateData, SoundDocument, SoundMetadataPatch } from '../types/sound';
import { describeStorageError } from '../utils/errors';
import { parseSoundDoc, sortSounds } from '../utils/soundDoc';
import { IS_DEMO } from '../config';
import {
  demoCreate, demoDeleteBlob, demoDeleteDoc, demoGetBlob, demoSubscribe, demoUpdate,
} from '../demo/demoStore';
import { getDb, getStorageInstance } from './firebase';

export interface SoundsSnapshot {
  /** Cue có thể phát (status = ready). */
  sounds: SoundDocument[];
  /** Cue đang xóa dở hoặc lỗi — chỉ admin xử lý, không bao giờ phát. */
  broken: SoundDocument[];
  /** Document sai cấu trúc (bị bỏ qua). */
  invalid: { id: string; reason: string }[];
}

const COLLECTION = 'sounds';

/** Một listener duy nhất cho toàn app (không subscribe theo từng item). */
export function subscribeSounds(
  onData: (snap: SoundsSnapshot) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  if (IS_DEMO) return demoSubscribe(onData);
  return onSnapshot(
    collection(getDb(), COLLECTION),
    (snap) => {
      const sounds: SoundDocument[] = [];
      const broken: SoundDocument[] = [];
      const invalid: { id: string; reason: string }[] = [];
      snap.docs.forEach((d) => {
        const parsed = parseSoundDoc(d.id, d.data({ serverTimestamps: 'estimate' }));
        if (!parsed.ok) {
          invalid.push({ id: d.id, reason: parsed.reason });
          return;
        }
        (parsed.value.status === 'ready' ? sounds : broken).push(parsed.value);
      });
      onData({ sounds: sortSounds(sounds), broken: sortSounds(broken), invalid });
    },
    onError,
  );
}

/** Tải bytes qua SDK (tuân thủ Auth/Storage Rules). Cần CORS cho bucket. */
export async function fetchSoundBlob(storagePath: string): Promise<Blob> {
  if (IS_DEMO) return demoGetBlob(storagePath);
  try {
    return await getBlob(ref(getStorageInstance(), storagePath));
  } catch (err) {
    throw new Error(describeStorageError(err));
  }
}

export async function createSoundDoc(id: string, data: SoundCreateData): Promise<void> {
  if (IS_DEMO) return demoCreate(id, data);
  await setDoc(doc(getDb(), COLLECTION, id), data);
}

export async function updateSoundMetadata(id: string, patch: SoundMetadataPatch): Promise<void> {
  if (IS_DEMO) return demoUpdate(id, { ...patch, title: patch.title.trim(), scene: patch.scene.trim() });
  await updateDoc(doc(getDb(), COLLECTION, id), {
    title: patch.title.trim(),
    scene: patch.scene.trim(),
    sceneOrder: patch.sceneOrder,
    sortOrder: patch.sortOrder,
    category: patch.category,
    defaultVolume: patch.defaultVolume,
    loopDefault: patch.loopDefault,
    trimStart: patch.trimStart,
    trimEnd: patch.trimEnd,
    playbackRate: patch.playbackRate,
    fadeIn: patch.fadeIn,
    fadeOut: patch.fadeOut,
    updatedAt: serverTimestamp(),
  });
}

export async function markSoundDeleting(id: string): Promise<void> {
  if (IS_DEMO) return demoUpdate(id, { status: 'deleting' });
  await updateDoc(doc(getDb(), COLLECTION, id), { status: 'deleting', updatedAt: serverTimestamp() });
}

/** Xóa file Storage; `object-not-found` coi như đã xóa (idempotent). */
export async function deleteStorageFile(path: string): Promise<void> {
  if (IS_DEMO) return demoDeleteBlob(path);
  try {
    await deleteObject(ref(getStorageInstance(), path));
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'storage/object-not-found') return;
    throw err;
  }
}

export async function deleteSoundDoc(id: string): Promise<void> {
  if (IS_DEMO) return demoDeleteDoc(id);
  await deleteDoc(doc(getDb(), COLLECTION, id));
}
