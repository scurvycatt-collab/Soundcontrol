// Cắt (trim) không phá hủy + tốc độ phát: các hàm thuần túy dùng chung cho engine, UI và kiểm tra.

export const MIN_TRIM_SECONDS = 0.1;
/** Sai số làm tròn float (4.1 - 4 = 0.0999…) khi so với MIN_TRIM_SECONDS. */
const EPS = 1e-6;
export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
/** Fade in/out tối đa (giây, theo thời gian thực). 0 = tắt. */
export const FADE_MAX = 10;
export const clampFade = (f: number): number => (Number.isFinite(f) ? Math.min(FADE_MAX, Math.max(0, f)) : 0);
export const RATE_PRESETS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2] as const;

export const clampRate = (r: number): number => (Number.isFinite(r) ? Math.min(RATE_MAX, Math.max(RATE_MIN, r)) : 1);

export interface TrimWindow {
  start: number; // giây trong file gốc
  end: number;
  length: number; // end - start (giây "media", chưa chia tốc độ)
  trimmed: boolean;
}

/**
 * Chuẩn hóa vùng phát. `fileDuration` là độ dài file (0/NaN: chưa biết → chỉ dựa vào trimEnd).
 * Luôn trả về vùng hợp lệ (length > 0) nếu có thể; nếu cấu hình hỏng thì rơi về cả file.
 */
export function resolveWindow(trimStart: number, trimEnd: number, fileDuration: number): TrimWindow {
  const known = Number.isFinite(fileDuration) && fileDuration > 0;
  let start = Number.isFinite(trimStart) && trimStart > 0 ? trimStart : 0;
  let end = Number.isFinite(trimEnd) && trimEnd > 0 ? trimEnd : known ? fileDuration : 0;
  if (known) {
    end = Math.min(end, fileDuration);
    if (start > fileDuration - MIN_TRIM_SECONDS + EPS) {
      // cấu hình hỏng: không phát ra một đoạn rỗng, bỏ cắt hoàn toàn
      start = 0;
      end = fileDuration;
    }
  }
  if (end - start < MIN_TRIM_SECONDS - EPS && end > 0) {
    start = 0;
    end = known ? fileDuration : end;
  }
  const trimmed = start > 0.001 || (known && end < fileDuration - 0.001) || (!known && end > 0);
  return { start, end, length: Math.max(0, end - start), trimmed };
}

/** Thời gian thực (giây) để phát `mediaSeconds` ở tốc độ `rate`. */
export const realSeconds = (mediaSeconds: number, rate: number): number => mediaSeconds / (rate > 0 ? rate : 1);

export function validateTrim(trimStart: number, trimEnd: number, fileDuration: number): string | null {
  if (!Number.isFinite(trimStart) || trimStart < 0) return 'Điểm bắt đầu phải là số ≥ 0.';
  if (!Number.isFinite(trimEnd) || trimEnd < 0) return 'Điểm kết thúc phải là số ≥ 0.';
  const end = trimEnd > 0 ? trimEnd : fileDuration;
  if (fileDuration > 0 && trimStart > fileDuration - MIN_TRIM_SECONDS + EPS) return 'Điểm bắt đầu nằm sát hoặc sau cuối file.';
  if (fileDuration > 0 && end > fileDuration + 0.01) return `Điểm kết thúc vượt quá độ dài file (${fileDuration.toFixed(2)} giây).`;
  if (end - trimStart < MIN_TRIM_SECONDS - EPS) return `Đoạn cắt phải dài ít nhất ${MIN_TRIM_SECONDS} giây.`;
  return null;
}
