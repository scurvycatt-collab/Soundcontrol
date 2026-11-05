// Chạy bằng: npm run test:rules  (firebase emulators:exec — cần Java + Firebase Emulator)
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT = 'demo-stage-audio';
let env: RulesTestEnvironment;

const SOUND_ID = 'snd1';
const UUID = '123e4567-e89b-42d3-a456-426614174000';
const PATH = `sounds/${SOUND_ID}/${UUID}.mp3`;

const validDoc = (over: Record<string, unknown> = {}) => ({
  id: SOUND_ID,
  title: 'Mưa',
  scene: 'Cảnh 1',
  sceneOrder: 1,
  sortOrder: 1,
  category: 'SFX',
  storagePath: PATH,
  originalFilename: 'mua.mp3',
  mimeType: 'audio/mpeg',
  fileSizeBytes: 1234,
  durationSeconds: 12.5,
  defaultVolume: 0.8,
  loopDefault: false,
  status: 'ready',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdByUid: 'admin1',
  ...over,
});

const admin = () => env.authenticatedContext('admin1', { role: 'admin' });
const operator = () => env.authenticatedContext('op1', { role: 'operator' });
const norole = () => env.authenticatedContext('x1');
const anon = () => env.unauthenticatedContext();

async function seedDoc(over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sounds', SOUND_ID), {
      ...validDoc(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    });
  });
}

async function seedFile(path = PATH) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]), { contentType: 'audio/mpeg' });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

describe('A20 — Firestore Rules', () => {
  it('anonymous và user không có role: không đọc/ghi được', async () => {
    await seedDoc();
    await assertFails(getDoc(doc(anon().firestore(), 'sounds', SOUND_ID)));
    await assertFails(getDoc(doc(norole().firestore(), 'sounds', SOUND_ID)));
    await assertFails(setDoc(doc(anon().firestore(), 'sounds', 'new1'), validDoc({ id: 'new1', storagePath: `sounds/new1/${UUID}.mp3` })));
  });

  it('operator đọc được, không ghi/sửa/xóa được', async () => {
    await seedDoc();
    const db = operator().firestore();
    await assertSucceeds(getDoc(doc(db, 'sounds', SOUND_ID)));
    await assertFails(updateDoc(doc(db, 'sounds', SOUND_ID), { title: 'Hack', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'sounds', 'new1'), validDoc({ id: 'new1', storagePath: `sounds/new1/${UUID}.mp3`, createdByUid: 'op1' })));
    await assertFails(deleteDoc(doc(db, 'sounds', SOUND_ID)));
  });

  it('client không thể tự nâng role bằng cách ghi vào collection khác', async () => {
    await assertFails(setDoc(doc(operator().firestore(), 'users', 'op1'), { role: 'admin' }));
  });

  it('admin tạo doc hợp lệ', async () => {
    await assertSucceeds(setDoc(doc(admin().firestore(), 'sounds', SOUND_ID), validDoc()));
  });

  it('admin bị từ chối khi doc sai: category, volume, key lạ, thiếu key, id lệch, status, path, mime', async () => {
    const db = admin().firestore();
    const bad = (over: Record<string, unknown>) => assertFails(setDoc(doc(db, 'sounds', SOUND_ID), validDoc(over)));
    await bad({ category: 'MUSIC' });
    await bad({ defaultVolume: 1.5 });
    await bad({ defaultVolume: -0.1 });
    await bad({ title: '' });
    await bad({ sceneOrder: -1 });
    await bad({ sceneOrder: 1.5 });
    await bad({ fileSizeBytes: 100 * 1024 * 1024 + 1 });
    await bad({ mimeType: 'video/mp4' });
    await bad({ status: 'deleting' }); // tạo mới phải là ready
    await bad({ id: 'other' });
    await bad({ storagePath: `sounds/other/${UUID}.mp3` });
    await bad({ storagePath: 'sounds/snd1/my song.mp3' });
    await bad({ createdByUid: 'someone-else' });
    await bad({ extraField: 'x' });
    await bad({ createdAt: new Date(2000, 1, 1) }); // timestamp phải do server
    const { title: _t, ...missing } = validDoc();
    await assertFails(setDoc(doc(db, 'sounds', SOUND_ID), missing));
  });

  it('admin sửa metadata được; không sửa được trường bất biến', async () => {
    await seedDoc();
    const d = doc(admin().firestore(), 'sounds', SOUND_ID);
    await assertSucceeds(
      updateDoc(d, { title: 'Mưa to', scene: 'Cảnh 2', defaultVolume: 0.5, category: 'BGM', loopDefault: true, updatedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(d, { storagePath: `sounds/${SOUND_ID}/${UUID.replace('4', '5')}.mp3`, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(d, { createdByUid: 'evil', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(d, { fileSizeBytes: 1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(d, { defaultVolume: 9, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(d, { title: 'x' })); // thiếu updatedAt = request.time
  });

  it('xóa doc: chỉ admin và chỉ khi status = deleting (khớp trình tự xóa của app)', async () => {
    await seedDoc();
    const d = doc(admin().firestore(), 'sounds', SOUND_ID);
    await assertFails(deleteDoc(d)); // còn ready
    await assertSucceeds(updateDoc(d, { status: 'deleting', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(operator().firestore(), 'sounds', SOUND_ID)));
    await assertSucceeds(deleteDoc(d));
  });
});

describe('A16/A20/A21 — Storage Rules', () => {
  const bytes = (n: number) => new Uint8Array(n);

  it('A21: admin/operator đọc được; anonymous và user không role bị từ chối', async () => {
    await seedFile();
    await assertSucceeds(getBytes(ref(admin().storage(), PATH)));
    await assertSucceeds(getBytes(ref(operator().storage(), PATH)));
    await assertFails(getBytes(ref(anon().storage(), PATH)));
    await assertFails(getBytes(ref(norole().storage(), PATH)));
  });

  it('admin upload mp3/wav hợp lệ', async () => {
    await assertSucceeds(uploadBytes(ref(admin().storage(), PATH), bytes(100), { contentType: 'audio/mpeg' }));
    await assertSucceeds(
      uploadBytes(ref(admin().storage(), `sounds/s2/${UUID}.wav`), bytes(100), { contentType: 'audio/wav' }),
    );
  });

  it('A20: operator và anonymous không upload/xóa được', async () => {
    await assertFails(uploadBytes(ref(operator().storage(), PATH), bytes(10), { contentType: 'audio/mpeg' }));
    await assertFails(uploadBytes(ref(anon().storage(), PATH), bytes(10), { contentType: 'audio/mpeg' }));
    await seedFile();
    await assertFails(deleteObject(ref(operator().storage(), PATH)));
    await assertFails(deleteObject(ref(anon().storage(), PATH)));
    await assertSucceeds(deleteObject(ref(admin().storage(), PATH)));
  });

  it('A16: từ chối sai contentType, tên file không phải UUID, đuôi lạ, path ngoài sounds/, file rỗng', async () => {
    const s = admin().storage();
    await assertFails(uploadBytes(ref(s, PATH), bytes(10), { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(s, PATH), bytes(10), { contentType: 'audio/ogg' }));
    await assertFails(uploadBytes(ref(s, `sounds/${SOUND_ID}/my song.mp3`), bytes(10), { contentType: 'audio/mpeg' }));
    await assertFails(uploadBytes(ref(s, `sounds/${SOUND_ID}/${UUID}.exe`), bytes(10), { contentType: 'audio/mpeg' }));
    await assertFails(uploadBytes(ref(s, `other/${UUID}.mp3`), bytes(10), { contentType: 'audio/mpeg' }));
    await assertFails(uploadBytes(ref(s, PATH), bytes(0), { contentType: 'audio/mpeg' }));
  });

  it('A16: từ chối > 100 MiB, chấp nhận đúng 100 MiB', async () => {
    const s = admin().storage();
    await assertFails(uploadBytes(ref(s, PATH), bytes(100 * 1024 * 1024 + 1), { contentType: 'audio/mpeg' }));
    await assertSucceeds(uploadBytes(ref(s, PATH), bytes(100 * 1024 * 1024), { contentType: 'audio/mpeg' }));
  });

  it('không ghi đè file đã tồn tại', async () => {
    await seedFile();
    await assertFails(uploadBytes(ref(admin().storage(), PATH), bytes(20), { contentType: 'audio/mpeg' }));
  });
});
