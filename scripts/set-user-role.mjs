#!/usr/bin/env node
// Gán / gỡ role (custom claim) cho tài khoản Firebase Auth. CHẠY CỤC BỘ, không đưa vào frontend.
//
// Dùng với dự án thật:
//   export GOOGLE_APPLICATION_CREDENTIALS=/duong/dan/serviceAccount.json   (KHÔNG commit file này)
//   node scripts/set-user-role.mjs --email nguoi@vidu.com --role admin
//
// Dùng với Emulator:
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/set-user-role.mjs --project demo-stage-audio --email a@b.c --role admin
//
// --role: admin | operator | none (gỡ role)
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const email = args.email;
const uid = args.uid;
const role = args.role;
const VALID = ['admin', 'operator', 'none'];

if ((!email && !uid) || !VALID.includes(role)) {
  console.error('Cách dùng: node scripts/set-user-role.mjs (--email <email> | --uid <uid>) --role <admin|operator|none> [--project <projectId>]');
  process.exit(1);
}

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = args.project || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

try {
  initializeApp(usingEmulator ? { projectId: projectId || 'demo-stage-audio' } : { credential: applicationDefault(), projectId });
  const auth = getAuth();
  const user = email ? await auth.getUserByEmail(email) : await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  if (role === 'none') delete claims.role;
  else claims.role = role;
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`OK: ${user.email ?? user.uid} -> role = ${role}`);
  console.log('Người dùng cần đăng xuất/đăng nhập lại (hoặc đợi tối đa 1 giờ) để token nhận role mới.');
} catch (err) {
  console.error('Lỗi:', err instanceof Error ? err.message : err);
  process.exit(1);
}
