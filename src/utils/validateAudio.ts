import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../config';
import type { SoundCategory } from '../types/sound';

export type AudioExt = 'mp3' | 'wav';

const ACCEPTED_MIME = new Set([
  '', // một số hệ điều hành không điền MIME; vẫn kiểm tra đuôi + magic bytes
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
]);

/** Đuôi .mp3/.wav, không phân biệt hoa/thường. */
export function getAudioExt(filename: string): AudioExt | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === 'mp3' || ext === 'wav' ? ext : null;
}

export function contentTypeFor(ext: AudioExt): 'audio/mpeg' | 'audio/wav' {
  return ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
}

export type FileValidation = { ok: true; ext: AudioExt } | { ok: false; message: string };

export function validateAudioFile(file: { name: string; size: number; type: string }): FileValidation {
  const ext = getAudioExt(file.name);
  if (!ext) return { ok: false, message: 'Chỉ chấp nhận tệp .mp3 hoặc .wav.' };
  if (!ACCEPTED_MIME.has(file.type.toLowerCase())) {
    return { ok: false, message: `Loại tệp "${file.type}" không được hỗ trợ (chỉ MP3/WAV).` };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, message: 'Tệp rỗng.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `Tệp vượt quá giới hạn ${MAX_UPLOAD_MB} MiB.` };
  }
  return { ok: true, ext };
}

function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được tệp'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob.slice(start, end));
  });
}

/** Kiểm tra magic bytes: không chỉ tin vào đuôi tệp / thuộc tính accept. */
export async function sniffAudioFile(blob: Blob, ext: AudioExt): Promise<boolean> {
  let b: Uint8Array;
  try {
    b = await readSlice(blob, 0, 12);
  } catch {
    return false;
  }
  if (b.length < 4) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(b.slice(from, to)));
  if (ext === 'wav') return b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  const id3 = ascii(0, 3) === 'ID3';
  const frameSync = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
  return id3 || frameSync;
}

/** Đọc thời lượng bằng phần tử audio; trả 0 nếu không đọc được (không chặn upload). */
export function readAudioDuration(blob: Blob, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const timer = setTimeout(() => done(0), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

export interface MetadataInput {
  title: string;
  scene: string;
  sceneOrder: number;
  sortOrder: number;
  category: SoundCategory;
  defaultVolume: number;
}

/** Trả về thông báo lỗi đầu tiên hoặc null nếu hợp lệ. Khớp các ràng buộc của Firestore Rules. */
export function validateMetadata(m: MetadataInput): string | null {
  const title = m.title.trim();
  const scene = m.scene.trim();
  if (!title) return 'Tên âm thanh không được để trống.';
  if (title.length > 120) return 'Tên âm thanh tối đa 120 ký tự.';
  if (!scene) return 'Cảnh kịch không được để trống.';
  if (scene.length > 80) return 'Tên cảnh tối đa 80 ký tự.';
  if (!Number.isInteger(m.sceneOrder) || m.sceneOrder < 0 || m.sceneOrder > 100000) {
    return 'Thứ tự cảnh phải là số nguyên từ 0 đến 100000.';
  }
  if (!Number.isInteger(m.sortOrder) || m.sortOrder < 0 || m.sortOrder > 100000) {
    return 'Thứ tự trong cảnh phải là số nguyên từ 0 đến 100000.';
  }
  if (m.category !== 'BGM' && m.category !== 'SFX') return 'Nhóm phải là BGM hoặc SFX.';
  if (!Number.isFinite(m.defaultVolume) || m.defaultVolume < 0 || m.defaultVolume > 1) {
    return 'Âm lượng mặc định phải nằm trong khoảng 0–100%.';
  }
  return null;
}
