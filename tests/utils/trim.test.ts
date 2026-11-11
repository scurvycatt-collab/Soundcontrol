import { describe, expect, it } from 'vitest';
import { clampRate, realSeconds, resolveWindow, validateTrim } from '../../src/utils/trim';
import { parseSoundDoc, toTrackConfig } from '../../src/utils/soundDoc';
import { validateMetadata } from '../../src/utils/validateAudio';

const ts = { toMillis: () => 1 };
const doc = (extra: Record<string, unknown> = {}) => ({
  title: 't', scene: 's', sceneOrder: 1, sortOrder: 1, category: 'SFX', storagePath: 'sounds/a/b.wav', originalFilename: 'f.wav',
  mimeType: 'audio/wav', fileSizeBytes: 10, durationSeconds: 10, defaultVolume: 1, loopDefault: false, status: 'ready',
  createdAt: ts, updatedAt: ts, createdByUid: 'u', ...extra,
});

describe('resolveWindow', () => {
  it('không cắt → cả file', () => expect(resolveWindow(0, 0, 10)).toEqual({ start: 0, end: 10, length: 10, trimmed: false }));
  it('cắt đầu/cuối', () => expect(resolveWindow(2, 6, 10)).toEqual({ start: 2, end: 6, length: 4, trimmed: true }));
  it('trimEnd 0 + trimStart > 0 → đến hết file', () => expect(resolveWindow(3, 0, 10)).toMatchObject({ start: 3, end: 10, length: 7, trimmed: true }));
  it('trimEnd vượt file → bị chặn ở cuối file', () => expect(resolveWindow(0, 99, 10)).toMatchObject({ end: 10, trimmed: false }));
  it('đoạn quá ngắn / đầu sát cuối file → rơi về cả file', () => {
    expect(resolveWindow(5, 5.05, 10)).toMatchObject({ start: 0, end: 10, trimmed: false });
    expect(resolveWindow(9.99, 0, 10)).toMatchObject({ start: 0, end: 10 });
  });
  it('chưa biết độ dài file: dựa vào trimEnd', () => expect(resolveWindow(1, 4, 0)).toMatchObject({ start: 1, end: 4, length: 3 }));
});

describe('tốc độ', () => {
  it('clampRate', () => {
    expect(clampRate(1.25)).toBe(1.25);
    expect(clampRate(0)).toBe(0.5);
    expect(clampRate(5)).toBe(2);
    expect(clampRate(NaN)).toBe(1);
  });
  it('realSeconds chia theo tốc độ', () => {
    expect(realSeconds(10, 2)).toBe(5);
    expect(realSeconds(10, 0.5)).toBe(20);
  });
});

describe('validateTrim / validateMetadata', () => {
  it('chấp nhận cấu hình hợp lệ', () => expect(validateTrim(1, 4, 10)).toBeNull());
  it('từ chối đoạn < 0.1s, đầu âm, cuối vượt file, đầu sau cuối', () => {
    expect(validateTrim(1, 1.05, 10)).toMatch(/ít nhất/);
    expect(validateTrim(-1, 4, 10)).toMatch(/≥ 0/);
    expect(validateTrim(0, 11, 10)).toMatch(/vượt quá/);
    expect(validateTrim(5, 3, 10)).toMatch(/ít nhất/);
    expect(validateTrim(9.95, 0, 10)).toMatch(/sát hoặc sau/);
  });
  const base = { title: 't', scene: 's', sceneOrder: 1, sortOrder: 1, category: 'SFX' as const, defaultVolume: 1 };
  it('validateMetadata kiểm tra tốc độ và điểm cắt', () => {
    expect(validateMetadata({ ...base, playbackRate: 3 })).toMatch(/Tốc độ/);
    expect(validateMetadata({ ...base, playbackRate: 1.5, trimStart: 1, trimEnd: 4, fileDuration: 10 })).toBeNull();
    expect(validateMetadata({ ...base, trimStart: 1, trimEnd: 1.01, fileDuration: 10 })).toMatch(/ít nhất/);
  });
});

describe('parseSoundDoc / toTrackConfig với trường mới', () => {
  it('doc cũ (không có trường mới) vẫn hợp lệ, mặc định 0/0/1', () => {
    const r = parseSoundDoc('a', doc());
    expect(r.ok).toBe(true);
    if (r.ok) expect(toTrackConfig(r.value)).toMatchObject({ trimStart: 0, trimEnd: 0, playbackRate: 1 });
  });
  it('đọc trường mới', () => {
    const r = parseSoundDoc('a', doc({ trimStart: 1.5, trimEnd: 4, playbackRate: 1.25 }));
    expect(r.ok && toTrackConfig(r.value)).toMatchObject({ trimStart: 1.5, trimEnd: 4, playbackRate: 1.25 });
  });
  it('từ chối giá trị sai', () => {
    expect(parseSoundDoc('a', doc({ playbackRate: 5 })).ok).toBe(false);
    expect(parseSoundDoc('a', doc({ trimStart: -1 })).ok).toBe(false);
    expect(parseSoundDoc('a', doc({ trimEnd: 'x' })).ok).toBe(false);
  });
});

describe('trim — sai số float', () => {
  it('đoạn đúng 0.1s (4.0→4.1) hợp lệ', () => {
    expect(validateTrim(4, 4.1, 10)).toBeNull();
    expect(resolveWindow(4, 4.1, 10)).toMatchObject({ start: 4, end: 4.1, trimmed: true });
  });
});
