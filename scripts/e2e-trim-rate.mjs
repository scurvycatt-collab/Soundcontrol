// E2E thật (Chrome + Howler + AudioContext thật) cho CẮT (trim) và TỐC ĐỘ. Chạy: node scripts/e2e-trim-rate.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5198/e2e/index.html');
await page.waitForFunction(() => window.ready === true);
await page.click('#gesture');
await page.waitForFunction(() => window.snap().engineState === 'ready');

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); if (!ok) failed++; };
const snap = () => page.evaluate(() => JSON.parse(JSON.stringify(window.snap())));
const wait = (ms) => page.waitForTimeout(ms);
const set = (list) => page.evaluate((l) => window.engine.syncSounds(l.map((x) => ({ ...window.cfgOf(x.id, x.cat, x.secs), ...x.extra }))), list);
/** Bắt đầu phát rồi đo (trong trang) thời gian từ lúc playing tới lúc ended. */
const timeToEnd = (id, maxMs = 8000) =>
  page.evaluate(async ({ id, maxMs }) => {
    await window.engine.toggle(id);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const w0 = performance.now();
    while (window.snap().tracks[id].playbackStatus !== 'playing') {
      if (performance.now() - w0 > 3000) return -2; // không bao giờ phát
      await sleep(5);
    }
    const t0 = performance.now(); // đo từ lúc thực sự "playing"
    while (performance.now() - t0 < maxMs) {
      if (window.snap().tracks[id].playbackStatus === 'ended') return performance.now() - t0;
      await sleep(10);
    }
    return -1;
  }, { id, maxMs });

await set([
  { id: 'full', cat: 'SFX', secs: 6 },
  { id: 'cut', cat: 'SFX', secs: 6, extra: { trimStart: 1, trimEnd: 2.5 } },
  { id: 'cutfast', cat: 'SFX', secs: 6, extra: { trimStart: 1, trimEnd: 2.5, playbackRate: 2 } },
  { id: 'tail', cat: 'SFX', secs: 6, extra: { trimStart: 4.5 } },
  { id: 'loopbgm', cat: 'BGM', secs: 8, extra: { trimStart: 2, trimEnd: 3, loopDefault: true } },
  { id: 'slow', cat: 'SFX', secs: 2, extra: { playbackRate: 0.5 } },
]);

let s = await snap();
check('Trước khi nạp: thời lượng hiển thị = đoạn cắt (1.5s), bắt đầu 1s', s.tracks.cut.durationSeconds === 1.5 && s.tracks.cut.windowStartSeconds === 1, JSON.stringify(s.tracks.cut));

let ms = await timeToEnd('cut');
check('Cắt 1.0–2.5s của file 6s: kết thúc sau ≈1.5s (không phải 6s)', ms > 1100 && ms < 2300, `${Math.round(ms)}ms`);
s = await snap();
check('Sau khi nạp: duration vẫn 1.5, file 6s', s.tracks.cut.durationSeconds === 1.5 && s.tracks.cut.fileDurationSeconds === 6, JSON.stringify(s.tracks.cut));

ms = await timeToEnd('cutfast');
check('Cắt 1.5s ở tốc độ ×2: kết thúc sau ≈0.75s', ms > 450 && ms < 1400, `${Math.round(ms)}ms`);

ms = await timeToEnd('tail');
check('Chỉ trimStart=4.5 (đến hết file 6s): kết thúc sau ≈1.5s', ms > 1100 && ms < 2300, `${Math.round(ms)}ms`);

ms = await timeToEnd('slow');
check('File 2s ở tốc độ ×0.5: kết thúc sau ≈4s', ms > 3400 && ms < 5000, `${Math.round(ms)}ms`);

// vị trí theo thời gian + seek trong đoạn cắt
await page.evaluate(() => window.engine.replay('cut'));
await wait(500);
s = await snap();
const p1 = s.tracks.cut.seekSeconds;
check('Seek hiển thị tương đối đầu đoạn cắt (≈0.5 sau 0.5s)', p1 > 0.25 && p1 < 0.9, String(p1));
await page.evaluate(() => window.engine.seek('cut', 1.0));
await wait(120);
s = await snap();
check('seek(1.0) trong đoạn cắt → vị trí ≈1.0–1.3', s.tracks.cut.seekSeconds >= 0.95 && s.tracks.cut.seekSeconds <= 1.4, String(s.tracks.cut.seekSeconds));
await page.evaluate(() => window.engine.stopAll());
await wait(100);
s = await snap();
check('STOP ALL → seek về 0', s.tracks.cut.seekSeconds === 0 && s.tracks.cut.playbackStatus === 'ready');

// đổi tốc độ khi đang phát
await page.evaluate(() => window.engine.toggle('full'));
await wait(400);
const a = (await snap()).tracks.full.seekSeconds;
await page.evaluate(() => window.engine.setRate('full', 2));
await wait(500);
const b = (await snap()).tracks.full.seekSeconds;
check('Đổi sang ×2 khi đang phát: vị trí vẫn tiến liên tục và nhanh hơn', b - a > 0.7 && b - a < 1.6 && (await snap()).tracks.full.playbackStatus === 'playing', `${a}→${b}`);
await page.evaluate(() => window.engine.stopAll());

// BGM cắt + lặp trong đoạn
await page.evaluate(() => window.engine.toggle('loopbgm'));
await wait(2600);
s = await snap();
check('BGM cắt 1s + loop: sau 2.6s vẫn playing và vị trí nằm trong đoạn (0–1s)', s.tracks.loopbgm.playbackStatus === 'playing' && s.tracks.loopbgm.seekSeconds >= 0 && s.tracks.loopbgm.seekSeconds <= 1.05, JSON.stringify(s.tracks.loopbgm));
await page.evaluate(() => window.engine.stopAll());

// Đổi điểm cắt khi rảnh → áp dụng ở lần phát sau
await set([{ id: 'cut', cat: 'SFX', secs: 6, extra: { trimStart: 0, trimEnd: 0.8 } }]);
s = await snap();
check('Đổi điểm cắt lúc rảnh → duration mới 0.8, cue về trạng thái chưa nạp', s.tracks.cut.durationSeconds === 0.8 && s.tracks.cut.playbackStatus === 'idle', JSON.stringify(s.tracks.cut));
ms = await timeToEnd('cut');
check('Phát lại với điểm cắt mới: kết thúc sau ≈0.8s', ms > 500 && ms < 1500, `${Math.round(ms)}ms`);


// Replay giữ tốc độ đã chọn (Howler đặt lại rate của sound theo howl khi phát lại)
await set([{ id: 'cut', cat: 'SFX', secs: 6, extra: { trimStart: 1, trimEnd: 2.5 } }]);
await page.evaluate(() => window.engine.setRate('cut', 1.5));
ms = await timeToEnd('cut');
check('Đã đặt ×1.5 trước khi phát: đoạn 1.5s kết thúc sau ≈1.0s', ms > 750 && ms < 1500, `${Math.round(ms)}ms`);
ms = await page.evaluate(async () => {
  const sleep = (m) => new Promise((r) => setTimeout(r, m));
  await window.engine.replay('cut');
  while (window.snap().tracks.cut.playbackStatus !== 'playing') await sleep(5);
  const t0 = performance.now();
  while (window.snap().tracks.cut.playbackStatus !== 'ended' && performance.now() - t0 < 5000) await sleep(10);
  return performance.now() - t0;
});
check('Replay vẫn giữ ×1.5 (≈1.0s, không về ×1)', ms > 750 && ms < 1500, `${Math.round(ms)}ms`);

// Pause / Resume trong đoạn cắt giữ vị trí
await page.evaluate(() => window.engine.stopAll());
await page.evaluate(() => window.engine.setRate('cut', 1));
await page.evaluate(() => window.engine.toggle('cut'));
await wait(500);
await page.evaluate(() => window.engine.toggle('cut')); // pause
await wait(100);
const paused = (await snap()).tracks.cut;
await wait(500);
const still = (await snap()).tracks.cut;
check('Pause giữ nguyên vị trí (≈0.5s tương đối)', paused.playbackStatus === 'paused' && Math.abs(still.seekSeconds - paused.seekSeconds) < 0.05 && paused.seekSeconds > 0.3 && paused.seekSeconds < 0.8, `${paused.seekSeconds}/${still.seekSeconds}`);
const resumeMs = await page.evaluate(async () => {
  const sleep = (m) => new Promise((r) => setTimeout(r, m));
  await window.engine.toggle('cut'); // resume
  const t0 = performance.now();
  while (window.snap().tracks.cut.playbackStatus !== 'ended' && performance.now() - t0 < 5000) await sleep(10);
  return performance.now() - t0;
});
check('Resume chạy nốt phần còn lại của đoạn cắt (≈1.0s)', resumeMs > 600 && resumeMs < 1500, `${Math.round(resumeMs)}ms`);

check('Không có lỗi trang', errors.length === 0, errors.join('|'));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
