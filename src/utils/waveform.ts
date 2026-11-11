// Sóng âm (waveform): tính đỉnh biên độ theo N cột từ dữ liệu giải mã, cache để không giải mã lại.

export const WAVE_BINS = 160;
const MAX_DECODE_BYTES = 60 * 1024 * 1024; // file lớn hơn: bỏ qua sóng âm (tránh tốn RAM), vẫn tua được bằng thanh trống
const LS_PREFIX = 'wf1:';

/** Thuần túy, dễ test: max |sample| mỗi cột (gộp mọi kênh), chuẩn hóa về 0..255 theo đỉnh lớn nhất. */
export function peaksFromChannels(channels: readonly Float32Array[], bins = WAVE_BINS): Uint8Array {
  const out = new Float32Array(bins);
  const len = channels.reduce((m, c) => Math.max(m, c.length), 0);
  if (len === 0 || bins <= 0) return new Uint8Array(bins);
  const per = len / bins;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * per);
    const to = Math.max(from + 1, Math.floor((b + 1) * per));
    let peak = 0;
    for (const ch of channels) {
      const end = Math.min(to, ch.length);
      for (let i = from; i < end; i++) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
    }
    out[b] = peak;
  }
  let max = 0;
  for (const v of out) if (v > max) max = v;
  const res = new Uint8Array(bins);
  if (max > 0) for (let b = 0; b < bins; b++) res[b] = Math.round((out[b] / max) * 255);
  return res;
}

const mem = new Map<string, Uint8Array>();
let chain: Promise<unknown> = Promise.resolve();

function readCache(key: string): Uint8Array | null {
  const hit = mem.get(key);
  if (hit) return hit;
  try {
    const s = localStorage.getItem(LS_PREFIX + key);
    if (!s) return null;
    const bin = atob(s);
    const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (arr.length !== WAVE_BINS) return null;
    mem.set(key, arr);
    return arr;
  } catch {
    return null;
  }
}

function writeCache(key: string, peaks: Uint8Array): void {
  mem.set(key, peaks);
  try {
    localStorage.setItem(LS_PREFIX + key, btoa(String.fromCharCode(...peaks)));
  } catch {
    /* hết dung lượng / bị chặn: bỏ qua, vẫn dùng cache bộ nhớ */
  }
}

async function decodePeaks(blob: Blob): Promise<Uint8Array> {
  const Ctor = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Ctor) throw new Error('Không hỗ trợ giải mã sóng âm');
  const ctx = new Ctor(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const channels: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
  return peaksFromChannels(channels, WAVE_BINS);
}

/**
 * Trả về peaks (hoặc null nếu không tính được). Giải mã lần lượt từng file một để không đẩy RAM lên cao.
 * `key` nên đổi khi nội dung file đổi (dùng storagePath: UUID, không ghi đè).
 */
export function loadPeaks(key: string, getBlob: () => Promise<Blob>): Promise<Uint8Array | null> {
  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  const run = async (): Promise<Uint8Array | null> => {
    const again = readCache(key);
    if (again) return again;
    try {
      const blob = await getBlob();
      if (blob.size > MAX_DECODE_BYTES) return null;
      const peaks = await decodePeaks(blob);
      writeCache(key, peaks);
      return peaks;
    } catch {
      return null;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}
