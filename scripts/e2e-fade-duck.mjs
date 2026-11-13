// E2E thật (Chrome + Howler + AudioContext thật) cho FADE IN/OUT và GIẢM BGM (ducking). Chạy: node scripts/e2e-fade-duck.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5197/e2e/index.html');
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


/** Âm lượng thật của howl theo độ dài file (làm nhãn): trả về _volume của Howl. */
const vol = (dur) => page.evaluate((d) => { const h = window.Howler._howls.find((x) => Math.abs(x._duration - d) < 0.05); return h ? h._volume : null; }, dur);
/** Lấy mẫu âm lượng mỗi 40ms trong khi chạy tới khi kết thúc. */
const sample = (id, dur, maxMs = 6000) =>
  page.evaluate(async ({ id, dur, maxMs }) => {
    const sleep = (m) => new Promise((r) => setTimeout(r, m));
    const get = () => { const h = window.Howler._howls.find((x) => Math.abs(x._duration - dur) < 0.05); return h ? h._volume : null; };
    await window.engine.toggle(id);
    while (window.snap().tracks[id].playbackStatus !== 'playing') await sleep(5);
    const out = []; const t0 = performance.now();
    while (performance.now() - t0 < maxMs && window.snap().tracks[id].playbackStatus === 'playing') { out.push([Math.round(performance.now() - t0), get()]); await sleep(40); }
    return out;
  }, { id, dur, maxMs });

await set([
  { id: 'fx', cat: 'SFX', secs: 3, extra: { fadeIn: 1, fadeOut: 1 } },
]);
let samples = await sample('fx', 3);
const first = samples[0][1];
const mid = samples.filter(([t]) => t > 1300 && t < 1700).map((x) => x[1]);
const nearEnd = samples.filter(([t]) => t > 2700).map((x) => x[1]);
check('Fade in: mẫu đầu tiên ≈ 0 (không giật)', first < 0.15, `first=${first}`);
const t500 = samples.find(([t]) => t >= 480)?.[1];
check('Fade in: sau ≈0.5s âm lượng ≈ 0.5', t500 > 0.3 && t500 < 0.7, `v(0.5s)=${t500}`);
check('Giữa đoạn: âm lượng đầy (≈1)', mid.length > 0 && Math.min(...mid) > 0.95, `min=${Math.min(...mid)}`);
check('Fade out: gần cuối âm lượng < 0.4 và giảm dần', nearEnd.length > 0 && Math.max(...nearEnd) < 0.45, `max=${Math.max(...nearEnd || [1])}`);
let mono = true; for (let i = 1; i < samples.length; i++) { const t = samples[i][0]; if (t < 900 && samples[i][1] < samples[i-1][1] - 0.02) mono = false; if (t > 2100 && samples[i][1] > samples[i-1][1] + 0.02) mono = false; }
check('Đường fade đơn điệu (không nhấp nhô)', mono);

// Fade + tốc độ ×2: fade vẫn tính theo thời gian thực
await set([{ id: 'fx2', cat: 'SFX', secs: 4, extra: { fadeOut: 1, playbackRate: 2 } }]);
samples = await sample('fx2', 4);
const tEnd = samples[samples.length - 1][0];
const v1 = samples.find(([t]) => t >= tEnd - 500)?.[1];
check('Tốc độ ×2: đoạn 4s dài ≈2s thực, fade out 1s thực → gần cuối < 0.8', tEnd > 1500 && tEnd < 2800 && v1 < 0.8, `end=${tEnd}ms v=${v1}`);

// Ducking: BGM 20s + SFX 3s
await set([
  { id: 'bgm', cat: 'BGM', secs: 20 },
  { id: 'sfx', cat: 'SFX', secs: 3 },
]);
await page.evaluate(() => window.engine.setDuck({ enabled: true, level: 0.3 }));
await page.evaluate(() => window.engine.toggle('bgm'));
await wait(300);
check('BGM đang phát ở 100% trước khi có SFX', (await vol(20)) > 0.99, `${await vol(20)}`);
await page.evaluate(() => window.engine.toggle('sfx'));
await wait(500);
const vDucked = await vol(20);
check('SFX phát → BGM hạ xuống ≈30%', vDucked > 0.25 && vDucked < 0.36, `bgm=${vDucked}`);
check('SFX giữ nguyên 100% (không bị hạ)', (await vol(3)) > 0.99, `sfx=${await vol(3)}`);
await wait(3200); // SFX 3s hết + giữ 0.5s
await wait(1500);
const vBack = await vol(20);
check('SFX hết → BGM trở lại ≈100%', vBack > 0.98, `bgm=${vBack}`);
// tắt duck giữa chừng
await page.evaluate(() => window.engine.setDuck({ enabled: false }));
await page.evaluate(() => window.engine.toggle('sfx'));
await wait(500);
check('Tắt “Giảm BGM”: BGM không bị hạ khi SFX phát', (await vol(20)) > 0.99, `${await vol(20)}`);
await page.evaluate(() => window.engine.stopAll());
await wait(200);
check('Không có lỗi trang', errors.length === 0, errors.join('|').slice(0, 200));
console.log(failed ? `\n${failed} FAILED` : '\nALL FADE/DUCK CHECKS PASSED');
await browser.close(); await server.close();
process.exit(failed ? 1 : 0);
