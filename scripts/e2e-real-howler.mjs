// E2E với Chrome thật + Howler thật. Chạy: npm run e2e  (cần Google Chrome; dùng playwright-core, không tải browser)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));
await page.goto('http://localhost:5199/e2e/index.html');
await page.waitForFunction(() => window.ready === true);

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); if (!ok) failed++; };
const snap = () => page.evaluate(() => JSON.parse(JSON.stringify(window.snap())));
const st = async (id) => (await snap()).tracks[id].playbackStatus;
const wait = (ms) => page.waitForTimeout(ms);
const run = (fn, ...a) => page.evaluate(fn, ...a);

// A01: không tự phát, locked khi chưa có user gesture
let s = await snap();
check('A01 chưa unlock → engineState locked', s.engineState === 'locked', s.engineState);
await run(() => window.engine.toggle('bgmA'));
check('A01 play khi locked bị chặn (không phát)', (await st('bgmA')) === 'idle' && (await snap()).notice?.message.includes('Kích hoạt'));

// A02: unlock bằng click thật
await page.click('#gesture');
await page.waitForFunction(() => window.snap().engineState === 'ready', null, { timeout: 5000 }).catch(() => {});
s = await snap();
check('A02 unlock bằng click thật → ready', s.engineState === 'ready', s.engineState);
check('A02 Test Sound không ném lỗi', await run(() => window.engine.testSound()) === true);

// A03: phát BGM A → status playing + seek tiến triển (audio thật chạy)
await run(() => window.engine.toggle('bgmA'));
await wait(600);
s = await snap();
check('A03 bgmA playing', s.tracks.bgmA.playbackStatus === 'playing', s.tracks.bgmA.playbackStatus);
const t1 = s.tracks.bgmA.seekSeconds; await wait(500); const t2 = (await snap()).tracks.bgmA.seekSeconds;
check('A03 seek tiến triển theo thời gian thật', t2 > t1 && t2 > 0.3, `${t1} → ${t2}`);

// A06 + A03: chuyển BGM B, SFX song song
await run(async () => { await window.engine.toggle('sfx1'); await window.engine.toggle('sfx2'); });
await run(() => window.engine.toggle('bgmB'));
await wait(500);
s = await snap();
const bgmPlaying = ['bgmA', 'bgmB', 'bgmBad'].filter((id) => s.tracks[id].playbackStatus === 'playing');
check('A03 chỉ 1 BGM phát (bgmB), bgmA đã dừng', bgmPlaying.length === 1 && bgmPlaying[0] === 'bgmB', bgmPlaying.join());
check('A06 BGM + 2 SFX cùng phát', s.tracks.sfx1.playbackStatus === 'playing' && s.tracks.sfx2.playbackStatus === 'playing');

// A04: BGM lỗi giải mã khi bgmB đang phát
await run(() => window.engine.toggle('bgmBad'));
await wait(800);
s = await snap();
check('A04 bgmBad → error, bgmB vẫn phát', s.tracks.bgmBad.playbackStatus === 'error' && s.tracks.bgmB.playbackStatus === 'playing', JSON.stringify([s.tracks.bgmBad, s.tracks.bgmB.playbackStatus]));

// A09: pause → resume đúng vị trí
await run(() => window.engine.toggle('sfx1')); // pause
await wait(100);
const pausedAt = (await snap()).tracks.sfx1.seekSeconds;
check('A09 sfx1 paused', (await st('sfx1')) === 'paused');
await wait(600);
check('A09 vị trí giữ nguyên khi paused', Math.abs((await snap()).tracks.sfx1.seekSeconds - pausedAt) < 0.1);
await run(() => window.engine.toggle('sfx1')); // resume
await wait(400);
const resumed = (await snap()).tracks.sfx1.seekSeconds;
check('A09 resume tiếp tục từ vị trí cũ (không về 0)', (await st('sfx1')) === 'playing' && resumed >= pausedAt && resumed < pausedAt + 1.2, `${pausedAt} → ${resumed}`);

// A10: seek
await run(() => window.engine.seek('bgmB', 4));
await wait(150);
const sk = (await snap()).tracks.bgmB.seekSeconds;
check('A10 seek 4s', sk >= 3.9 && sk < 5, String(sk));

// A07: replay liên tục không nhân instance
await run(async () => { for (let i = 0; i < 6; i++) await window.engine.replay('sfx2'); });
await wait(300);
s = await snap();
check('A07 replay x6: vẫn playing, activeSfxCount = 2', s.tracks.sfx2.playbackStatus === 'playing' && s.activeSfxCount === 2, `${s.activeSfxCount}`);
check('A07 replay về đầu (<1s)', s.tracks.sfx2.seekSeconds < 1, String(s.tracks.sfx2.seekSeconds));

// A12: master volume / mute không đổi volume từng track
await run(() => { window.engine.setTrackVolume('bgmB', 0.5); window.engine.setMasterVolume(0.2); window.engine.setMasterMute(true); });
s = await snap();
check('A12 volume track giữ 0.5, master 0.2, muted', s.tracks.bgmB.volume === 0.5 && s.masterVolume === 0.2 && s.masterMuted === true);
await run(() => window.engine.setMasterMute(false));

// A05 + STOP ALL
await run(() => { window.engine.toggle('bgmA'); window.engine.toggle('bgmB'); window.engine.stopAll(); });
await wait(800);
s = await snap();
check('A05 STOP ALL: không track nào playing', Object.values(s.tracks).every((t) => t.playbackStatus !== 'playing'), JSON.stringify(Object.values(s.tracks).map((t) => t.playbackStatus)));
check('A05 STOP ALL reset seek 0, count 0', s.activeSfxCount === 0 && s.activeBgmId === null);

// A11: kết thúc tự nhiên
await run(() => window.engine.toggle('short'));
await wait(1700);
check('A11 hết bài → ended (onend thật)', (await st('short')) === 'ended', await st('short'));
check('A11 ended → activeSfxCount 0', (await snap()).activeSfxCount === 0);
// loop
await run(() => window.engine.setLoop('short', true));
await run(() => window.engine.toggle('short'));
await wait(2300);
check('A11 loop on → vẫn playing sau khi quá thời lượng', (await st('short')) === 'playing', await st('short'));
await run(() => window.engine.stopAll());

// Prepare + dispose
const r = await run(() => window.engine.prepareShow(['bgmA', 'bgmB', 'sfx1', 'sfx2', 'short', 'bgmBad']));
check('Prepare Show: 5 ready, 1 failed (rác)', r.ready === 5 && r.failed.length === 1, JSON.stringify(r));
await run(() => window.engine.dispose());
check('dispose không ném lỗi', true);

const errs = logs.filter((l) => l.startsWith('PAGEERROR') || l.startsWith('error:'));
console.log('\nConsole errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL E2E CHECKS PASSED');
process.exit(failed ? 1 : 0);
