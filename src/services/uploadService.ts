import { serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import type { SoundCategory, SoundCreateData } from '../types/sound';
import { describeUploadError } from '../utils/errors';
import {
  contentTypeFor,
  readAudioDuration,
  sniffAudioFile,
  validateAudioFile,
  validateMetadata,
} from '../utils/validateAudio';
import { IS_DEMO } from '../config';
import { demoPutBlob } from '../demo/demoStore';
import { recordOrphan } from './diagnostics';
import { getStorageInstance } from './firebase';
import { createSoundDoc, deleteStorageFile } from './soundRepository';

export interface UploadParams {
  file: File;
  title: string;
  scene: string;
  sceneOrder: number;
  sortOrder: number;
  category: SoundCategory;
  defaultVolume: number; // 0..1
  loopDefault: boolean;
  uid: string;
}

export interface UploadTask {
  promise: Promise<void>;
  cancel(): void;
}

/** Tách khỏi Firebase để test được các nhánh lỗi/bù trừ. */
export interface UploadBackend {
  newId(): string;
  readDuration(file: Blob): Promise<number>;
  upload(path: string, file: Blob, contentType: string, onProgress: (ratio: number) => void): UploadTask;
  writeDoc(id: string, data: SoundCreateData): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export const firebaseUploadBackend: UploadBackend = {
  newId: () => crypto.randomUUID(),
  readDuration: readAudioDuration,
  upload(path, file, contentType, onProgress) {
    if (IS_DEMO) {
      const promise = demoPutBlob(path, file).then(() => onProgress(1));
      return { promise, cancel: () => undefined };
    }
    const task = uploadBytesResumable(ref(getStorageInstance(), path), file, { contentType });
    const promise = new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (s) => onProgress(s.totalBytes > 0 ? s.bytesTransferred / s.totalBytes : 0),
        (err) => reject(err),
        () => resolve(),
      );
    });
    return { promise, cancel: () => void task.cancel() };
  },
  writeDoc: createSoundDoc,
  deleteFile: deleteStorageFile,
};

export type UploadOutcome =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: 'invalid' | 'cancelled' | 'upload-failed' | 'metadata-failed';
      message: string;
      /** Có giá trị nếu rollback xóa file thất bại: file có thể còn mồ côi trên Storage. */
      orphanPath?: string;
    };

export interface UploadHandle {
  promise: Promise<UploadOutcome>;
  cancel(): void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Upload có bù trừ (Storage và Firestore không atomic):
 *  validate → upload resumable → ghi metadata (status ready) → nếu ghi lỗi: xóa file vừa upload.
 * Cue chỉ xuất hiện trong danh sách phát sau khi metadata ghi thành công.
 */
export function startUpload(
  params: UploadParams,
  onProgress: (ratio: number) => void = () => undefined,
  backend: UploadBackend = firebaseUploadBackend,
): UploadHandle {
  let cancelled = false;
  let activeTask: UploadTask | null = null;

  const run = async (): Promise<UploadOutcome> => {
    const invalid = (message: string): UploadOutcome => ({ ok: false, reason: 'invalid', message });

    const metaError = validateMetadata({
      title: params.title,
      scene: params.scene,
      sceneOrder: params.sceneOrder,
      sortOrder: params.sortOrder,
      category: params.category,
      defaultVolume: params.defaultVolume,
    });
    if (metaError) return invalid(metaError);

    const fileCheck = validateAudioFile(params.file);
    if (!fileCheck.ok) return invalid(fileCheck.message);
    if (!(await sniffAudioFile(params.file, fileCheck.ext))) {
      return invalid('Nội dung tệp không phải MP3/WAV hợp lệ (sai định dạng hoặc tệp hỏng).');
    }
    if (cancelled) return { ok: false, reason: 'cancelled', message: 'Đã hủy upload.' };

    const durationSeconds = await backend.readDuration(params.file);
    const id = backend.newId();
    const storagePath = `sounds/${id}/${backend.newId()}.${fileCheck.ext}`;
    const mimeType = contentTypeFor(fileCheck.ext);

    activeTask = backend.upload(storagePath, params.file, mimeType, onProgress);
    if (cancelled) activeTask.cancel();
    try {
      await activeTask.promise;
    } catch (err) {
      if (cancelled || (err as { code?: string } | null)?.code === 'storage/canceled') {
        return { ok: false, reason: 'cancelled', message: 'Đã hủy upload.' };
      }
      return { ok: false, reason: 'upload-failed', message: describeUploadError(err) };
    }
    activeTask = null;

    // Hủy ngay sau khi upload xong, trước khi ghi metadata: dọn file, không tạo doc.
    if (cancelled) {
      try {
        await backend.deleteFile(storagePath);
      } catch (e) {
        recordOrphan(storagePath, `cancel cleanup failed: ${errText(e)}`);
        return { ok: false, reason: 'cancelled', message: 'Đã hủy upload nhưng chưa xóa được file tạm.', orphanPath: storagePath };
      }
      return { ok: false, reason: 'cancelled', message: 'Đã hủy upload.' };
    }

    const data: SoundCreateData = {
      id,
      title: params.title.trim(),
      scene: params.scene.trim(),
      sceneOrder: params.sceneOrder,
      sortOrder: params.sortOrder,
      category: params.category,
      storagePath,
      originalFilename: params.file.name.slice(0, 255),
      mimeType,
      fileSizeBytes: params.file.size,
      durationSeconds,
      defaultVolume: params.defaultVolume,
      loopDefault: params.loopDefault,
      status: 'ready',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: params.uid,
    };

    try {
      await backend.writeDoc(id, data);
    } catch (writeErr) {
      // Bù trừ: không để file mồ côi.
      try {
        await backend.deleteFile(storagePath);
      } catch (rollbackErr) {
        recordOrphan(storagePath, `rollback failed: ${errText(rollbackErr)}`);
        return {
          ok: false,
          reason: 'metadata-failed',
          message: `Ghi metadata thất bại (${errText(writeErr)}) và không xóa được file vừa upload. File mồ côi: ${storagePath} — hãy xóa thủ công trong Firebase Console.`,
          orphanPath: storagePath,
        };
      }
      return {
        ok: false,
        reason: 'metadata-failed',
        message: `Ghi metadata thất bại (${errText(writeErr)}). File đã upload được xóa lại; hãy thử lại.`,
      };
    }
    return { ok: true, id };
  };

  const promise = run();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      activeTask?.cancel();
    },
  };
}
