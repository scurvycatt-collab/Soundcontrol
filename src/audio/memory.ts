import type { TrackConfig } from './types';

const BYTES_PER_SECOND_DECODED = 44_100 * 2 * 4; // 44.1 kHz, stereo, float32 (Web Audio AudioBuffer)

/**
 * Ước tính RAM sau khi giải mã (Web Audio giải mã TOÀN BỘ file thành PCM float32).
 * MP3 10 phút ≈ 10 MB trên đĩa nhưng ≈ 210 MB trong RAM. Dùng durationSeconds nếu có,
 * nếu không thì ước lượng thô theo định dạng. Chỉ là số ước tính — hãy đo trên máy diễn.
 */
export function estimateDecodedBytes(cfg: Pick<TrackConfig, 'durationSeconds' | 'fileSizeBytes' | 'format'>): number {
  if (Number.isFinite(cfg.durationSeconds) && cfg.durationSeconds > 0) {
    return Math.round(cfg.durationSeconds * BYTES_PER_SECOND_DECODED);
  }
  return cfg.fileSizeBytes * (cfg.format === 'wav' ? 2 : 12);
}
