import { describe, expect, it } from 'vitest';
import { ALL_SEGMENTS, SCRIPT, getSegment } from '../../src/data/script';
import { buildNavGroups, findSoundForCue, flattenNav } from '../../src/utils/segments';
import { peaksFromChannels } from '../../src/utils/waveform';
import type { SoundDocument } from '../../src/types/sound';

const snd = (o: Partial<SoundDocument>): SoundDocument =>
  ({ id: 'x', title: 't', scene: 'Đoạn 1.1', sceneOrder: 1, sortOrder: 1, category: 'SFX', storagePath: 'p', originalFilename: 'f.wav', mimeType: 'audio/wav', fileSizeBytes: 1, durationSeconds: 1, defaultVolume: 1, loopDefault: false, status: 'ready', createdByUid: 'u', ...o }) as SoundDocument;

describe('kịch bản Tấm Cám', () => {
  it('có 4 cảnh, 17 đoạn, id duy nhất, order tăng dần', () => {
    expect(SCRIPT).toHaveLength(4);
    expect(ALL_SEGMENTS).toHaveLength(17);
    expect(new Set(ALL_SEGMENTS.map((s) => s.id)).size).toBe(17);
    expect(ALL_SEGMENTS.map((s) => s.order)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    expect(getSegment('Ải 3')?.props).toContain('100 CONT');
    expect(getSegment('Đoạn 2.4')?.dialogue).toBe('Có thoại');
    expect(getSegment('Đoạn 2.4')?.mic).toContain('Quang');
    expect(ALL_SEGMENTS.every((s) => s.content && s.characters && s.cues.length > 0)).toBe(true);
  });
});

describe('so khớp cue / điều hướng', () => {
  it('khớp tên không phân biệt dấu/hoa thường, đúng đoạn và đúng nhóm', () => {
    const cue = { category: 'SFX' as const, name: 'Đá đít Bốp' };
    expect(findSoundForCue(cue, 'Đoạn 1.4', [snd({ scene: 'Đoạn 1.4', title: 'da dit bop' })])).toBeDefined();
    expect(findSoundForCue(cue, 'Đoạn 1.4', [snd({ scene: 'Đoạn 1.3', title: 'Đá đít Bốp' })])).toBeUndefined();
    expect(findSoundForCue(cue, 'Đoạn 1.4', [snd({ scene: 'Đoạn 1.4', title: 'Đá đít Bốp', category: 'BGM' })])).toBeUndefined();
  });

  it('nhóm điều hướng theo kịch bản + nhóm Khác, đếm cue đã có', () => {
    const groups = buildNavGroups([snd({ id: 'a', scene: 'Đoạn 1.4', title: 'Đá đít Bốp' }), snd({ id: 'b', scene: 'Cảnh tự đặt' })]);
    expect(groups.map((g) => g.key)).toEqual(['scene-1', 'scene-2', 'scene-3', 'scene-4', 'other']);
    expect(flattenNav(groups)).toHaveLength(18);
    const seg = groups[0].segments.find((s) => s.id === 'Đoạn 1.4')!;
    expect(seg).toMatchObject({ soundCount: 1, cueTotal: 2, cueDone: 1 }); // cueDone chỉ là gợi ý theo tên
  });
});

describe('peaksFromChannels', () => {
  it('lấy đỉnh theo cột, chuẩn hóa 0..255, gộp các kênh', () => {
    const l = new Float32Array([0, 0.5, 0, 0]);
    const r = new Float32Array([0, 0, -1, 0]);
    expect(Array.from(peaksFromChannels([l, r], 4))).toEqual([0, 128, 255, 0]);
    expect(Array.from(peaksFromChannels([new Float32Array(8)], 4))).toEqual([0, 0, 0, 0]);
    expect(peaksFromChannels([], 5)).toHaveLength(5);
  });
});
