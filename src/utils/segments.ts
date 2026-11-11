import { SCRIPT, type ScriptCue, type ScriptScene } from '../data/script';
import type { SoundDocument } from '../types/sound';

const norm = (s: string) =>
  s
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Cue của kịch bản đã có file chưa: so khớp theo tên (không phân biệt hoa/thường, dấu), thuộc đúng đoạn. */
export function findSoundForCue(cue: ScriptCue, segmentId: string, sounds: readonly SoundDocument[]): SoundDocument | undefined {
  const want = norm(cue.name);
  if (!want) return undefined;
  return sounds.find((s) => {
    if (s.scene !== segmentId || s.category !== cue.category) return false;
    const have = norm(s.title);
    return have === want || have.includes(want) || want.includes(have);
  });
}

export interface NavSegment {
  id: string;
  soundCount: number;
  cueTotal: number;
  cueDone: number;
}
export interface NavGroup {
  key: string;
  title: string;
  scene: ScriptScene | null;
  segments: NavSegment[];
}

/** Nhóm điều hướng: các cảnh theo kịch bản, cộng nhóm "Khác" cho scene tự đặt không có trong kịch bản. */
export function buildNavGroups(sounds: readonly SoundDocument[]): NavGroup[] {
  const known = new Set<string>();
  const groups: NavGroup[] = SCRIPT.map((sc) => ({
    key: `scene-${sc.number}`,
    title: `Cảnh ${sc.number}: ${sc.title}`,
    scene: sc,
    segments: sc.segments.map((seg) => {
      known.add(seg.id);
      return {
        id: seg.id,
        soundCount: sounds.filter((s) => s.scene === seg.id).length,
        cueTotal: seg.cues.length,
        cueDone: seg.cues.filter((c) => findSoundForCue(c, seg.id, sounds)).length,
      };
    }),
  }));
  const extra = [...new Set(sounds.map((s) => s.scene).filter((n) => !known.has(n)))].sort((a, b) =>
    a.localeCompare(b, 'vi', { numeric: true }),
  );
  if (extra.length > 0) {
    groups.push({
      key: 'other',
      title: 'Khác',
      scene: null,
      segments: extra.map((id) => ({ id, soundCount: sounds.filter((s) => s.scene === id).length, cueTotal: 0, cueDone: 0 })),
    });
  }
  return groups;
}

export const flattenNav = (groups: readonly NavGroup[]): string[] => groups.flatMap((g) => g.segments.map((s) => s.id));
