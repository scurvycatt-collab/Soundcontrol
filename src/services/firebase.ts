import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const env = import.meta.env;

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
] as const;

/** Tên các biến môi trường còn thiếu (để hiển thị hướng dẫn thay vì sập app). */
export function missingFirebaseConfig(): string[] {
  return REQUIRED.filter((k) => {
    const v = env[k];
    return !v || v.startsWith('your-');
  });
}

export const useEmulators = env.VITE_USE_EMULATORS === 'true';

let services: { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } | null = null;

function init() {
  if (services) return services;
  const missing = missingFirebaseConfig();
  if (missing.length) throw new Error(`Thiếu cấu hình Firebase: ${missing.join(', ')}`);

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      });

  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (useEmulators) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
    } catch {
      /* đã kết nối (HMR) */
    }
  }
  services = { app, auth, db, storage };
  return services;
}

export const getAuthInstance = (): Auth => init().auth;
export const getDb = (): Firestore => init().db;
export const getStorageInstance = (): FirebaseStorage => init().storage;
