import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startUpload, type UploadBackend, type UploadParams, type UploadTask } from '../../src/services/uploadService';
import { deleteSound, type DeleteBackend } from '../../src/services/deleteService';
import { listOrphans } from '../../src/services/diagnostics';

const mp3Bytes = () => new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]); // "ID3"
const mkFile = (name = 'mua.mp3', bytes: Uint8Array = mp3Bytes(), type = 'audio/mpeg') =>
  new File([bytes as BlobPart], name, { type });

const params = (over: Partial<UploadParams> = {}): UploadParams => ({
  file: mkFile(),
  title: 'Mưa',
  scene: 'Cảnh 1',
  sceneOrder: 1,
  sortOrder: 1,
  category: 'SFX',
  defaultVolume: 1,
  loopDefault: false,
  uid: 'admin-uid',
  ...over,
});

interface Fake extends UploadBackend {
  uploaded: string[];
  docs: Map<string, unknown>;
  deleted: string[];
  calls: string[];
}

function fakeBackend(opts: {
  uploadError?: unknown;
  writeError?: unknown;
  deleteError?: unknown;
  holdUpload?: Promise<void>;
} = {}): Fake {
  let n = 0;
  const b: Fake = {
    uploaded: [],
    docs: new Map(),
    deleted: [],
    calls: [],
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    readDuration: async () => 12.5,
    upload(path, _file, _ct, onProgress): UploadTask {
      b.calls.push('upload');
      let cancel: () => void = () => undefined;
      const promise = (async () => {
        onProgress(0.5);
        if (opts.holdUpload) {
          await Promise.race([
            opts.holdUpload,
            new Promise<void>((_, rej) => {
              cancel = () => rej({ code: 'storage/canceled' });
            }),
          ]);
        }
        if (opts.uploadError) throw opts.uploadError;
        b.uploaded.push(path);
        onProgress(1);
      })();
      return { promise, cancel: () => cancel() };
    },
    async writeDoc(id, data) {
      b.calls.push('writeDoc');
      if (opts.writeError) throw opts.writeError;
      b.docs.set(id, data);
    },
    async deleteFile(path) {
      b.calls.push('deleteFile');
      if (opts.deleteError) throw opts.deleteError;
      b.deleted.push(path);
    },
  };
  return b;
}

beforeEach(() => localStorage.clear());

describe('A15 — upload hợp lệ', () => {
  it('upload → ghi metadata đúng → ready; báo progress; không lưu URL token', async () => {
    const b = fakeBackend();
    const progress = vi.fn();
    const out = await startUpload(params(), progress, b).promise;
    expect(out.ok).toBe(true);
    expect(b.calls).toEqual(['upload', 'writeDoc']); // metadata chỉ ghi SAU khi upload xong
    expect(progress).toHaveBeenCalledWith(1);
    const [path] = b.uploaded;
    expect(path).toMatch(/^sounds\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/);
    expect(path).not.toContain('mua'); // không dùng tên file người dùng làm đường dẫn
    const doc = [...b.docs.values()][0] as Record<string, unknown>;
    expect(doc).toMatchObject({
      title: 'Mưa',
      scene: 'Cảnh 1',
      category: 'SFX',
      storagePath: path,
      originalFilename: 'mua.mp3',
      mimeType: 'audio/mpeg',
      durationSeconds: 12.5,
      status: 'ready',
      createdByUid: 'admin-uid',
    });
    expect(JSON.stringify(doc)).not.toMatch(/token=|downloadURL|https?:\/\//);
  });

  it('chấp nhận .WAV (hoa) với magic bytes RIFF/WAVE, contentType audio/wav', async () => {
    const b = fakeBackend();
    const wav = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WAVE'].map((c) => c.charCodeAt(0))));
    const out = await startUpload(params({ file: mkFile('TIENG.WAV', wav, 'audio/x-wav') }), undefined, b).promise;
    expect(out.ok).toBe(true);
    expect([...b.docs.values()][0]).toMatchObject({ mimeType: 'audio/wav' });
  });
});

describe('A16 — từ chối trước khi upload', () => {
  it('sai định dạng / sai nội dung / metadata sai → không gọi backend', async () => {
    const b = fakeBackend();
    const cases: UploadParams[] = [
      params({ file: mkFile('a.ogg', mp3Bytes(), 'audio/ogg') }),
      params({ file: mkFile('fake.mp3', new Uint8Array([1, 2, 3, 4, 5, 6]), 'audio/mpeg') }), // đuôi mp3 nhưng nội dung không phải
      params({ title: '' }),
      params({ defaultVolume: 5 }),
    ];
    for (const p of cases) {
      const out = await startUpload(p, undefined, b).promise;
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe('invalid');
    }
    expect(b.calls).toEqual([]);
  });

  it('quá 100 MiB bị chặn bởi validate', async () => {
    const b = fakeBackend();
    const big = mkFile();
    Object.defineProperty(big, 'size', { value: 100 * 1024 * 1024 + 1 });
    const out = await startUpload(params({ file: big }), undefined, b).promise;
    expect(out).toMatchObject({ ok: false, reason: 'invalid' });
    expect(b.calls).toEqual([]);
  });
});

describe('upload thất bại / hủy', () => {
  it('upload lỗi → không tạo doc', async () => {
    const b = fakeBackend({ uploadError: { code: 'storage/unauthorized' } });
    const out = await startUpload(params(), undefined, b).promise;
    expect(out).toMatchObject({ ok: false, reason: 'upload-failed' });
    expect(b.docs.size).toBe(0);
    expect(b.calls).not.toContain('writeDoc');
  });

  it('hủy giữa chừng → cancelled, không tạo doc', async () => {
    const never = new Promise<void>(() => undefined);
    const b = fakeBackend({ holdUpload: never });
    const handle = startUpload(params(), undefined, b);
    await new Promise((r) => setTimeout(r, 20));
    handle.cancel();
    const out = await handle.promise;
    expect(out).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(b.docs.size).toBe(0);
  });
});

describe('A17 — Storage xong nhưng Firestore lỗi', () => {
  it('rollback xóa file; không có doc ready', async () => {
    const b = fakeBackend({ writeError: new Error('permission-denied') });
    const out = await startUpload(params(), undefined, b).promise;
    expect(out).toMatchObject({ ok: false, reason: 'metadata-failed' });
    expect(b.docs.size).toBe(0);
    expect(b.deleted).toEqual(b.uploaded); // file đã bị xóa lại
    expect(out.ok === false && out.orphanPath).toBeUndefined();
  });

  it('rollback cũng lỗi → báo orphan + ghi nhật ký để dọn', async () => {
    const b = fakeBackend({ writeError: new Error('boom'), deleteError: new Error('storage down') });
    const out = await startUpload(params(), undefined, b).promise;
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.orphanPath).toBe(b.uploaded[0]);
    expect(out.message).toMatch(/mồ côi/);
    expect(listOrphans().map((o) => o.path)).toContain(b.uploaded[0]);
  });
});

describe('A18/A19 — xóa & retry', () => {
  const sound = { id: 's1', storagePath: 'sounds/s1/x.mp3', status: 'ready' as const };

  function delBackend(over: Partial<DeleteBackend> = {}) {
    const calls: string[] = [];
    const b: DeleteBackend = {
      markDeleting: async () => void calls.push('mark'),
      deleteFile: async () => void calls.push('file'),
      deleteDoc: async () => void calls.push('doc'),
      ...over,
    };
    return { b, calls };
  }

  it('trình tự: mark deleting → xóa Storage → xóa doc', async () => {
    const { b, calls } = delBackend();
    expect(await deleteSound(sound, b)).toEqual({ ok: true });
    expect(calls).toEqual(['mark', 'file', 'doc']);
  });

  it('Storage lỗi → doc giữ lại ở trạng thái deleting, không xóa doc, retry được', async () => {
    let fail = true;
    const { b, calls } = delBackend({
      deleteFile: async () => {
        calls.push('file');
        if (fail) throw new Error('storage unavailable');
      },
    });
    const first = await deleteSound(sound, b);
    expect(first).toMatchObject({ ok: false, stage: 'storage' });
    expect(calls).not.toContain('doc');
    expect(listOrphans().map((o) => o.path)).toContain(sound.storagePath);

    fail = false;
    calls.length = 0;
    const retry = await deleteSound({ ...sound, status: 'deleting' }, b);
    expect(retry).toEqual({ ok: true });
    expect(calls).toEqual(['file', 'doc']); // không mark lại
  });

  it('Storage đã mất nhưng Firestore lỗi → retry idempotent hoàn tất', async () => {
    let docFail = true;
    const { b, calls } = delBackend({
      deleteDoc: async () => {
        calls.push('doc');
        if (docFail) throw new Error('firestore unavailable');
      },
    });
    const first = await deleteSound(sound, b);
    expect(first).toMatchObject({ ok: false, stage: 'firestore' });
    docFail = false;
    const retry = await deleteSound({ ...sound, status: 'deleting' }, b);
    expect(retry).toEqual({ ok: true });
  });

  it('không đánh dấu được → dừng, không xóa gì', async () => {
    const { b, calls } = delBackend({
      markDeleting: async () => {
        throw new Error('denied');
      },
    });
    expect(await deleteSound(sound, b)).toMatchObject({ ok: false, stage: 'mark' });
    expect(calls).toEqual([]);
  });
});
