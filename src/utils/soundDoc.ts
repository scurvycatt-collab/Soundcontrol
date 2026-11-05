import type { Timestamp } from 'firebase/firestore';
import type { SoundCategory, SoundDocument, StoredSoundStatus } from '../types/sound';
import type { AudioFormat, TrackConfig } from '../audio/types';

export type ParseResult = { ok: true; value: SoundDocument } | { ok: false; reason: string };

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isTs = (v: unknown): v is Timestamp =>
  typeof v === 'object' && v !== null && typeof (v as { toMillis?: unknown }).toMillis === 'function';

/** Kiểm tra document đọc từ Firestore; doc sai cấu trúc bị loại, không làm sập UI. */
export function parseSoundDoc(id: string, data: Record<string, unknown>): ParseResult {
  const bad = (reason: string): ParseResult => ({ ok: false, reason });
  if (!isStr(data.title) || !data.title.trim()) return bad('title');
  if (!isStr(data.scene)) return bad('scene');
  if (!isNum(data.sceneOrder) || data.sceneOrder < 0) return bad('sceneOrder');
  if (!isNum(data.sortOrder) || data.sortOrder < 0) return bad('sortOrder');
  if (data.category !== 'BGM' && data.category !== 'SFX') return bad('category');
  if (!isStr(data.storagePath) || !/\.(mp3|wav)$/i.test(data.storagePath)) return bad('storagePath');
  if (!isStr(data.originalFilename)) return bad('originalFilename');
  if (!isStr(data.mimeType)) return bad('mimeType');
  if (!isNum(data.fileSizeBytes) || data.fileSizeBytes < 0) return bad('fileSizeBytes');
  if (!isNum(data.durationSeconds) || data.durationSeconds < 0) return bad('durationSeconds');
  if (!isNum(data.defaultVolume) || data.defaultVolume < 0 || data.defaultVolume > 1) return bad('defaultVolume');
  if (typeof data.loopDefault !== 'boolean') return bad('loopDefault');
  if (data.status !== 'ready' && data.status !== 'deleting' && data.status !== 'error') return bad('status');
  if (!isTs(data.createdAt) || !isTs(data.updatedAt)) return bad('timestamps');
  if (!isStr(data.createdByUid)) return bad('createdByUid');

  return {
    ok: true,
    value: {
      id,
      title: data.title.trim(),
      scene: data.scene,
      sceneOrder: data.sceneOrder,
      sortOrder: data.sortOrder,
      category: data.category as SoundCategory,
      storagePath: data.storagePath,
      originalFilename: data.originalFilename,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      durationSeconds: data.durationSeconds,
      defaultVolume: data.defaultVolume,
      loopDefault: data.loopDefault,
      status: data.status as StoredSoundStatus,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      createdByUid: data.createdByUid,
    },
  };
}

export function formatOf(path: string): AudioFormat {
  return /\.wav$/i.test(path) ? 'wav' : 'mp3';
}

export function toTrackConfig(doc: SoundDocument): TrackConfig {
  return {
    id: doc.id,
    category: doc.category,
    format: formatOf(doc.storagePath),
    storagePath: doc.storagePath,
    fileSizeBytes: doc.fileSizeBytes,
    durationSeconds: doc.durationSeconds,
    defaultVolume: doc.defaultVolume,
    loopDefault: doc.loopDefault,
  };
}

export type SortMode = 'scene' | 'name';

export function sortSounds<T extends SoundDocument>(list: readonly T[], mode: SortMode = 'scene'): T[] {
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title, 'vi', { numeric: true });
  return [...list].sort((a, b) => {
    if (mode === 'name') return byTitle(a, b) || a.id.localeCompare(b.id);
    return (
      a.sceneOrder - b.sceneOrder ||
      a.sortOrder - b.sortOrder ||
      byTitle(a, b) ||
      a.id.localeCompare(b.id)
    );
  });
}

export function filterSounds<T extends SoundDocument>(
  list: readonly T[],
  opts: { query: string; scene: string },
): T[] {
  const q = opts.query.trim().toLocaleLowerCase('vi');
  return list.filter((s) => {
    if (opts.scene && s.scene !== opts.scene) return false;
    if (!q) return true;
    return (
      s.title.toLocaleLowerCase('vi').includes(q) ||
      s.scene.toLocaleLowerCase('vi').includes(q) ||
      s.originalFilename.toLocaleLowerCase('vi').includes(q)
    );
  });
}

/** Danh sách cảnh duy nhất, sắp theo sceneOrder. */
export function listScenes(list: readonly SoundDocument[]): string[] {
  const order = new Map<string, number>();
  for (const s of list) {
    const cur = order.get(s.scene);
    if (cur === undefined || s.sceneOrder < cur) order.set(s.scene, s.sceneOrder);
  }
  return [...order.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'vi', { numeric: true }))
    .map(([scene]) => scene);
}
