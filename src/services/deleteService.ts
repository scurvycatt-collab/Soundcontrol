import type { SoundDocument } from '../types/sound';
import { recordOrphan } from './diagnostics';
import { deleteSoundDoc, deleteStorageFile, markSoundDeleting } from './soundRepository';

export interface DeleteBackend {
  markDeleting(id: string): Promise<void>;
  deleteFile(path: string): Promise<void>; // phải idempotent (object-not-found = thành công)
  deleteDoc(id: string): Promise<void>;
}

export const firebaseDeleteBackend: DeleteBackend = {
  markDeleting: markSoundDeleting,
  deleteFile: deleteStorageFile,
  deleteDoc: deleteSoundDoc,
};

export type DeleteOutcome =
  | { ok: true }
  | { ok: false; stage: 'mark' | 'storage' | 'firestore'; message: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Trình tự: (UI đã confirm + stop) → status = 'deleting' → xóa Storage → xóa doc.
 * Mỗi bước có thể chạy lại (retry) mà không mất dấu record:
 *  - Storage lỗi: doc ở lại 'deleting' (bị loại khỏi danh sách phát), admin bấm Retry.
 *  - Storage đã mất nhưng Firestore lỗi: retry coi object-not-found là đã xóa.
 */
export async function deleteSound(
  sound: Pick<SoundDocument, 'id' | 'storagePath' | 'status'>,
  backend: DeleteBackend = firebaseDeleteBackend,
): Promise<DeleteOutcome> {
  if (sound.status !== 'deleting') {
    try {
      await backend.markDeleting(sound.id);
    } catch (e) {
      return { ok: false, stage: 'mark', message: `Không đánh dấu xóa được: ${msg(e)}` };
    }
  }
  try {
    await backend.deleteFile(sound.storagePath);
  } catch (e) {
    recordOrphan(sound.storagePath, `delete storage failed: ${msg(e)}`);
    return { ok: false, stage: 'storage', message: `Xóa file Storage thất bại: ${msg(e)}. Bản ghi được giữ lại để thử lại.` };
  }
  try {
    await backend.deleteDoc(sound.id);
  } catch (e) {
    return { ok: false, stage: 'firestore', message: `File đã xóa nhưng xóa bản ghi thất bại: ${msg(e)}. Bấm Retry để hoàn tất.` };
  }
  return { ok: true };
}
