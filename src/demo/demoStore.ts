// Kho cục bộ cho CHẾ ĐỘ DEMO (VITE_DEMO_MODE=true): metadata + file lưu trong IndexedDB của trình duyệt.
// Không dùng Firebase, không có xác thực. Chỉ để dùng thử/trình diễn trên một máy.
import type { SoundCreateData, SoundDocument, SoundMetadataPatch } from '../types/sound';
import type { SoundsSnapshot } from '../services/soundRepository';
import { parseSoundDoc, sortSounds } from '../utils/soundDoc';

const DB_NAME = 'stage-audio-demo';
const META = 'sounds';
const BLOBS = 'blobs';

type Meta = Omit<SoundDocument, 'createdAt' | 'updatedAt'> & { createdAtMs: number; updatedAtMs: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memBlobs = new Map<string, Blob>();
const metas = new Map<string, Meta>();
const listeners = new Set<(s: SoundsSnapshot) => void>();
let loaded = false;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'id' });
      req.result.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return resolve(undefined);
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const all = (await tx<Meta[]>(META, 'readonly', (s) => s.getAll())) ?? [];
  for (const m of all) metas.set(m.id, m);
  loaded = true;
}

const fakeTs = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000), nanoseconds: 0 }) as never;

function snapshot(): SoundsSnapshot {
  const sounds: SoundDocument[] = [];
  const broken: SoundDocument[] = [];
  const invalid: { id: string; reason: string }[] = [];
  for (const m of metas.values()) {
    const { createdAtMs, updatedAtMs, ...rest } = m;
    const parsed = parseSoundDoc(m.id, { ...rest, createdAt: fakeTs(createdAtMs), updatedAt: fakeTs(updatedAtMs) });
    if (!parsed.ok) invalid.push({ id: m.id, reason: parsed.reason });
    else (parsed.value.status === 'ready' ? sounds : broken).push(parsed.value);
  }
  return { sounds: sortSounds(sounds), broken: sortSounds(broken), invalid };
}

const emit = () => {
  const s = snapshot();
  for (const l of [...listeners]) l(s);
};
const persistMeta = (m: Meta) => tx(META, 'readwrite', (s) => void s.put(m));

export function demoSubscribe(onData: (s: SoundsSnapshot) => void): () => void {
  listeners.add(onData);
  void ensureLoaded().then(() => {
    if (listeners.has(onData)) onData(snapshot());
  });
  return () => void listeners.delete(onData);
}

export async function demoPutBlob(path: string, blob: Blob): Promise<void> {
  memBlobs.set(path, blob);
  await tx(BLOBS, 'readwrite', (s) => void s.put(blob, path));
}

export async function demoGetBlob(path: string): Promise<Blob> {
  const cached = memBlobs.get(path);
  if (cached) return cached;
  const b = await tx<Blob>(BLOBS, 'readonly', (s) => s.get(path));
  if (!b) throw new Error('Không tìm thấy file trong kho demo (có thể đã bị xóa).');
  memBlobs.set(path, b);
  return b;
}

export async function demoDeleteBlob(path: string): Promise<void> {
  memBlobs.delete(path);
  await tx(BLOBS, 'readwrite', (s) => void s.delete(path));
}

export async function demoCreate(id: string, data: SoundCreateData): Promise<void> {
  await ensureLoaded();
  const now = Date.now();
  const { createdAt: _c, updatedAt: _u, ...rest } = data;
  const m: Meta = { ...rest, createdAtMs: now, updatedAtMs: now } as Meta;
  metas.set(id, m);
  await persistMeta(m);
  emit();
}

export async function demoUpdate(id: string, patch: Partial<SoundMetadataPatch> & { status?: SoundDocument['status'] }): Promise<void> {
  await ensureLoaded();
  const cur = metas.get(id);
  if (!cur) throw new Error('Không tìm thấy bản ghi.');
  const next: Meta = { ...cur, ...patch, updatedAtMs: Date.now() };
  metas.set(id, next);
  await persistMeta(next);
  emit();
}

export async function demoDeleteDoc(id: string): Promise<void> {
  await ensureLoaded();
  metas.delete(id);
  await tx(META, 'readwrite', (s) => void s.delete(id));
  emit();
}

export async function demoClearAll(): Promise<void> {
  await ensureLoaded();
  for (const m of [...metas.values()]) {
    await demoDeleteBlob(m.storagePath);
    await demoDeleteDoc(m.id);
  }
}

// ---------- âm mẫu (sinh tại chỗ) ----------

function tone(seconds: number, notes: number[], opts: { decay?: boolean } = {}): Blob {
  const rate = 22050;
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let x = 0;
    for (const f of notes) x += Math.sin(2 * Math.PI * f * t);
    x /= notes.length;
    const env = opts.decay ? Math.exp(-3 * (t / seconds)) : Math.min(1, t * 4) * Math.min(1, (seconds - t) * 4);
    v.setInt16(44 + i * 2, x * env * 7000, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function demoSeedSamples(uid = 'demo'): Promise<number> {
  const samples: { title: string; scene: string; sceneOrder: number; sortOrder: number; category: 'BGM' | 'SFX'; blob: Blob; vol: number; loop: boolean; secs: number }[] = [
    { title: 'Nhạc mở màn (mẫu)', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 1, category: 'BGM', blob: tone(30, [261.6, 329.6, 392]), vol: 0.5, loop: true, secs: 30 },
    { title: 'Nhạc cao trào (mẫu)', scene: 'Cảnh 2', sceneOrder: 2, sortOrder: 1, category: 'BGM', blob: tone(30, [220, 277.2, 329.6]), vol: 0.5, loop: true, secs: 30 },
    { title: 'Chuông cửa (mẫu)', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 2, category: 'SFX', blob: tone(2, [880, 1108], { decay: true }), vol: 0.6, loop: false, secs: 2 },
    { title: 'Tiếng sấm (mẫu)', scene: 'Cảnh 2', sceneOrder: 2, sortOrder: 2, category: 'SFX', blob: tone(4, [60, 90, 120], { decay: true }), vol: 0.8, loop: false, secs: 4 },
    { title: 'Bíp ngắn (mẫu)', scene: 'Cảnh 2', sceneOrder: 2, sortOrder: 3, category: 'SFX', blob: tone(0.6, [1000], { decay: true }), vol: 0.5, loop: false, secs: 0.6 },
  ];
  for (const s of samples) {
    const id = crypto.randomUUID();
    const storagePath = `sounds/${id}/${crypto.randomUUID()}.wav`;
    await demoPutBlob(storagePath, s.blob);
    await demoCreate(id, {
      id, title: s.title, scene: s.scene, sceneOrder: s.sceneOrder, sortOrder: s.sortOrder, category: s.category,
      storagePath, originalFilename: 'sample.wav', mimeType: 'audio/wav', fileSizeBytes: s.blob.size,
      durationSeconds: s.secs, defaultVolume: s.vol, loopDefault: s.loop, status: 'ready',
      createdAt: undefined as never, updatedAt: undefined as never, createdByUid: uid,
    });
  }
  return samples.length;
}

// ---------- Tệp show (.stageshow): sao lưu / chuyển máy ----------
// Định dạng: "SAC1" | uint32 độ dài header | header JSON (UTF-8) | các blob nối tiếp theo thứ tự trong header.

const MAGIC = 'SAC1';

export async function demoExportShow(): Promise<{ blob: Blob; count: number }> {
  await ensureLoaded();
  const items = [...metas.values()].filter((m) => (m as { status: string }).status === 'ready');
  const blobs: Blob[] = [];
  const entries: { meta: Meta; size: number }[] = [];
  for (const m of items) {
    const b = await demoGetBlob(m.storagePath);
    blobs.push(b);
    entries.push({ meta: m, size: b.size });
  }
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, entries }));
  const len = new ArrayBuffer(4);
  new DataView(len).setUint32(0, header.length, false);
  return { blob: new Blob([MAGIC, len, header, ...blobs], { type: 'application/octet-stream' }), count: items.length };
}

export async function demoImportShow(file: Blob): Promise<number> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 4)) !== MAGIC) throw new Error('Không phải tệp show hợp lệ (.stageshow).');
  const hlen = new DataView(head.buffer, 4, 4).getUint32(0, false);
  if (hlen > 50 * 1024 * 1024) throw new Error('Tệp show hỏng (header quá lớn).');
  const parsed = JSON.parse(new TextDecoder().decode(await file.slice(8, 8 + hlen).arrayBuffer())) as {
    version: number;
    entries: { meta: Meta; size: number }[];
  };
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('Phiên bản tệp show không được hỗ trợ.');
  let offset = 8 + hlen;
  let n = 0;
  for (const { meta, size } of parsed.entries) {
    const blob = file.slice(offset, offset + size);
    offset += size;
    if (blob.size !== size) throw new Error('Tệp show bị cắt cụt / hỏng.');
    const typed = new Blob([blob], { type: meta.mimeType });
    await demoPutBlob(meta.storagePath, typed);
    const m: Meta = { ...meta, status: 'ready' } as Meta;
    metas.set(m.id, m);
    await persistMeta(m);
    n++;
  }
  emit();
  return n;
}
