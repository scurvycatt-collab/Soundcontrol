// Các ngưỡng vận hành (giá trị đề xuất để bắt đầu benchmark trên máy diễn thực tế).
export const MAX_UPLOAD_MB = 100;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_PRELOAD_TOTAL_MB = 250;
export const MAX_PRELOAD_TOTAL_BYTES = MAX_PRELOAD_TOTAL_MB * 1024 * 1024;
// Rào chắn thứ hai (đề xuất bổ sung, cần đo trên máy diễn): tổng RAM ước tính SAU khi giải mã.
export const MAX_DECODED_RAM_MB = 1024;
export const MAX_DECODED_RAM_BYTES = MAX_DECODED_RAM_MB * 1024 * 1024;
export const MAX_ACTIVE_SFX = 16;
export const DEFAULT_MASTER_VOLUME = 0.7;
export const PRELOAD_CONCURRENCY = 3;
export const ENGINE_TICK_MS = 200;

/** Chế độ demo: không Firebase, không đăng nhập, file lưu trong IndexedDB. */
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
