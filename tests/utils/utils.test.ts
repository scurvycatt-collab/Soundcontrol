import { describe, expect, it } from 'vitest';
import { formatBytes, formatTime } from '../../src/utils/formatTime';
import {
  contentTypeFor,
  getAudioExt,
  sniffAudioFile,
  validateAudioFile,
  validateMetadata,
} from '../../src/utils/validateAudio';
import { describeFirestoreError, describeStorageError } from '../../src/utils/errors';
import { filterSounds, listScenes, parseSoundDoc, sortSounds, toTrackConfig } from '../../src/utils/soundDoc';
import type { SoundDocument } from '../../src/types/sound';

describe('formatTime', () => {
  it('mm:ss và giá trị không hợp lệ', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(83.9)).toBe('01:23');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('00:00');
    expect(formatTime(-4)).toBe('00:00');
    expect(formatTime(Infinity)).toBe('00:00');
  });
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB');
  });
});

describe('A16 — validateAudioFile', () => {
  const f = (name: string, size = 1000, type = '') => ({ name, size, type });
  it('nhận .mp3/.wav không phân biệt hoa thường', () => {
    expect(validateAudioFile(f('a.mp3', 10, 'audio/mpeg'))).toEqual({ ok: true, ext: 'mp3' });
    expect(validateAudioFile(f('A.WAV', 10, 'audio/x-wav'))).toEqual({ ok: true, ext: 'wav' });
    expect(validateAudioFile(f('b.Mp3'))).toEqual({ ok: true, ext: 'mp3' });
  });
  it('từ chối sai định dạng', () => {
    expect(validateAudioFile(f('a.ogg', 10, 'audio/ogg')).ok).toBe(false);
    expect(validateAudioFile(f('a.mp3.exe', 10)).ok).toBe(false);
    expect(validateAudioFile(f('noext', 10)).ok).toBe(false);
    expect(validateAudioFile(f('a.mp3', 10, 'application/pdf')).ok).toBe(false);
  });
  it('từ chối rỗng và quá 100 MiB', () => {
    expect(validateAudioFile(f('a.mp3', 0)).ok).toBe(false);
    const tooBig = validateAudioFile(f('a.wav', 100 * 1024 * 1024 + 1));
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.message).toMatch(/100 MiB/);
    expect(validateAudioFile(f('a.wav', 100 * 1024 * 1024)).ok).toBe(true);
  });
  it('contentType/ext', () => {
    expect(getAudioExt('x.MP3')).toBe('mp3');
    expect(contentTypeFor('mp3')).toBe('audio/mpeg');
    expect(contentTypeFor('wav')).toBe('audio/wav');
  });
});

describe('sniffAudioFile (magic bytes)', () => {
  const blob = (bytes: number[]) => new Blob([new Uint8Array(bytes)]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  it('MP3: ID3 hoặc frame sync', async () => {
    expect(await sniffAudioFile(blob([...ascii('ID3'), 4, 0, 0, 0, 0, 0, 0, 0]), 'mp3')).toBe(true);
    expect(await sniffAudioFile(blob([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0]), 'mp3')).toBe(true);
    expect(await sniffAudioFile(blob(ascii('hello world!')), 'mp3')).toBe(false);
  });
  it('WAV: RIFF....WAVE', async () => {
    const wav = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')];
    expect(await sniffAudioFile(blob(wav), 'wav')).toBe(true);
    expect(await sniffAudioFile(blob(ascii('RIFF....AVI ')), 'wav')).toBe(false);
    expect(await sniffAudioFile(blob([1, 2]), 'wav')).toBe(false);
  });
});

describe('validateMetadata', () => {
  const ok = { title: 'Mưa', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 2, category: 'SFX' as const, defaultVolume: 0.5 };
  it('hợp lệ', () => expect(validateMetadata(ok)).toBeNull());
  it('từ chối giá trị sai', () => {
    expect(validateMetadata({ ...ok, title: '   ' })).toMatch(/Tên/);
    expect(validateMetadata({ ...ok, scene: '' })).toMatch(/Cảnh/);
    expect(validateMetadata({ ...ok, sceneOrder: -1 })).toMatch(/Thứ tự cảnh/);
    expect(validateMetadata({ ...ok, sortOrder: 1.5 })).toMatch(/Thứ tự/);
    expect(validateMetadata({ ...ok, defaultVolume: 2 })).toMatch(/Âm lượng/);
    expect(validateMetadata({ ...ok, category: 'X' as never })).toMatch(/Nhóm/);
    expect(validateMetadata({ ...ok, title: 'x'.repeat(121) })).toMatch(/120/);
  });
});

const ts = { toMillis: () => 1 } as never;
const raw = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: 'Mưa', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 1, category: 'SFX',
  storagePath: 'sounds/a/b.mp3', originalFilename: 'mua.mp3', mimeType: 'audio/mpeg',
  fileSizeBytes: 100, durationSeconds: 3, defaultVolume: 1, loopDefault: false,
  status: 'ready', createdAt: ts, updatedAt: ts, createdByUid: 'u1', ...over,
});

describe('parseSoundDoc / sort / filter', () => {
  it('parse hợp lệ và loại doc sai cấu trúc', () => {
    expect(parseSoundDoc('a', raw()).ok).toBe(true);
    expect(parseSoundDoc('a', raw({ category: 'XX' })).ok).toBe(false);
    expect(parseSoundDoc('a', raw({ defaultVolume: 3 })).ok).toBe(false);
    expect(parseSoundDoc('a', raw({ storagePath: 'sounds/a/b.ogg' })).ok).toBe(false);
    expect(parseSoundDoc('a', raw({ title: '  ' })).ok).toBe(false);
    expect(parseSoundDoc('a', raw({ durationSeconds: NaN })).ok).toBe(false);
  });

  const mk = (id: string, over: Record<string, unknown>): SoundDocument => {
    const r = parseSoundDoc(id, raw(over));
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };
  const list = [
    mk('3', { title: 'C', scene: 'Cảnh 2', sceneOrder: 2, sortOrder: 1 }),
    mk('1', { title: 'B', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 2 }),
    mk('2', { title: 'A', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 1 }),
    mk('4', { title: 'Mưa lớn', scene: 'Cảnh 3', sceneOrder: 3, sortOrder: 1, originalFilename: 'rain.WAV' }),
  ];

  it('sort theo sceneOrder, sortOrder, tên', () => {
    expect(sortSounds(list).map((s) => s.id)).toEqual(['2', '1', '3', '4']);
    expect(sortSounds(list, 'name').map((s) => s.title)).toEqual(['A', 'B', 'C', 'Mưa lớn']);
  });
  it('filter theo tên/cảnh/tệp (có dấu, không phân biệt hoa thường)', () => {
    expect(filterSounds(list, { query: 'mưa', scene: '' }).map((s) => s.id)).toEqual(['4']);
    expect(filterSounds(list, { query: 'RAIN', scene: '' }).map((s) => s.id)).toEqual(['4']);
    expect(filterSounds(list, { query: '', scene: 'Cảnh 1' })).toHaveLength(2);
    expect(filterSounds(list, { query: 'zzz', scene: '' })).toHaveLength(0);
  });
  it('listScenes theo sceneOrder', () => {
    expect(listScenes(list)).toEqual(['Cảnh 1', 'Cảnh 2', 'Cảnh 3']);
  });
  it('toTrackConfig lấy định dạng từ storagePath', () => {
    expect(toTrackConfig(mk('x', { storagePath: 'sounds/x/y.wav' })).format).toBe('wav');
    expect(toTrackConfig(mk('x', {})).format).toBe('mp3');
  });
});

describe('A23/A24 — thông báo lỗi Storage/Firestore', () => {
  it('permission denied', () => {
    expect(describeStorageError({ code: 'storage/unauthorized' })).toMatch(/quyền/);
    expect(describeFirestoreError({ code: 'permission-denied' })).toMatch(/quyền/);
  });
  it('CORS/mạng được chỉ rõ và trỏ tới README', () => {
    expect(describeStorageError(new TypeError('Failed to fetch'))).toMatch(/CORS/);
    expect(describeStorageError({ code: 'storage/unknown', message: 'x' })).toMatch(/CORS/);
  });
  it('object-not-found', () => {
    expect(describeStorageError({ code: 'storage/object-not-found' })).toMatch(/Không tìm thấy/);
  });
});
