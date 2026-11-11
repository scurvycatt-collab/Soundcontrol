// E2E bản demo đã build: chạy qua serve.mjs trong Chrome thật (headless, không có thiết bị loa).
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://127.0.0.1:5199/';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.getByText('CHẾ ĐỘ DEMO').first().waitFor({ timeout: 10000 });
check('Mở app, thấy banner demo', true);
await page.getByRole('button', { name: 'Kích hoạt âm thanh' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid=engine-badge]')?.textContent?.includes('Sẵn sàng'), null, { timeout: 8000 });
check('Kích hoạt âm thanh -> Sẵn sàng', true);
await page.getByRole('button', { name: 'Tạo âm mẫu' }).click();
await page.getByText('Nhạc buồn não nề').first().waitFor({ timeout: 8000 });
await page.getByText('Sấm sét / biến hình giật cục').first().waitFor({ timeout: 8000 });
check('Tạo âm mẫu -> hiện cue', true);

const card = (t) => page.locator('li[data-testid^=audio-item-]').filter({ hasText: t });
const status = async (t) => (await card(t).getByTestId('status-badge').innerText()).trim();
const waitStatus = async (t, re, ms = 6000) => { const end = Date.now() + ms; let s; while (Date.now() < end) { s = await status(t); if (re.test(s)) return s; await page.waitForTimeout(100); } return s; };

await page.getByRole('button', { name: 'Phát Nhạc buồn não nề' }).click();
let st = await waitStatus('Nhạc buồn não nề', /Playing/i);
check('Play BGM A -> Playing', /Playing/i.test(st), st);
await page.getByRole('button', { name: 'Phát Nhạc trend TikTok (Mèn mén)' }).click();
st = await waitStatus('Nhạc trend TikTok (Mèn mén)', /Playing/i);
const stA = await waitStatus('Nhạc buồn não nề', /Idle|Stopped|Paused/i);
check('Play BGM B -> B Playing, A dừng (≤1 BGM)', /Playing/i.test(st) && !/Playing/i.test(stA), `B=${st} A=${stA}`);
await page.getByRole('button', { name: 'Phát Sấm sét / biến hình giật cục' }).click();
st = await waitStatus('Sấm sét / biến hình giật cục', /Playing/i);
check('Play SFX -> Playing, BGM B vẫn phát', /Playing/i.test(st) && /Playing/i.test(await status('Nhạc trend TikTok (Mèn mén)')), st);
await page.getByTestId('stop-all').click();
await page.waitForTimeout(300);
const all = [await status('Nhạc trend TikTok (Mèn mén)'), await status('Sấm sét / biến hình giật cục')];
check('STOP ALL -> tất cả không còn Playing', all.every((x) => !/Playing/i.test(x)), all.join(','));
await page.getByRole('button', { name: 'Test Sound' }).click();
await page.waitForTimeout(500);

// Điều hướng đoạn + BGM cố định + kịch bản + sóng âm
const bgmBefore = await page.getByRole('region', { name: /Background Music/ }).getByTestId('status-badge').count();
await page.getByRole('button', { name: /^Đoạn 1\.2/ }).click();
await page.getByRole('region', { name: 'Kịch bản Đoạn 1.2' }).waitFor({ timeout: 5000 });
const sfxRegion = page.getByRole('region', { name: /Sound Effects/ });
const sfxNow = await sfxRegion.getByTestId('status-badge').count();
check('Chọn Đoạn 1.2 -> chỉ SFX của đoạn đó + panel kịch bản', sfxNow === 1 && (await page.getByText('Bụt xông ra').count()) > 0, `sfx=${sfxNow}`);
const bgmAfter = await page.getByRole('region', { name: /Background Music/ }).getByTestId('status-badge').count();
check('BGM vẫn hiển thị đủ khi đổi đoạn (cố định trên đầu)', bgmAfter === bgmBefore && bgmAfter > 5, `${bgmBefore}->${bgmAfter}`);
const dockY = await page.getByRole('region', { name: /Background Music/ }).first().evaluate((el) => el.getBoundingClientRect().top);
await page.getByRole('button', { name: /Tất cả đoạn/ }).click(); await page.evaluate(() => window.scrollTo(0, 3000));
await page.waitForTimeout(200);
await page.getByRole('button', { name: /^Đoạn 1\.2/ }).click();
const dockY2 = await page.getByRole('region', { name: /Background Music/ }).first().evaluate((el) => el.getBoundingClientRect().top);
check('Dock BGM dính trên đầu khi cuộn', dockY2 >= 0 && dockY2 < 200, `top ${dockY}->${dockY2}`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: /Đoạn sau/ }).click();
await page.getByRole('region', { name: 'Kịch bản Đoạn 1.3' }).waitFor({ timeout: 5000 });
check('Nút "Đoạn sau" chuyển 1.2 -> 1.3', true);
await page.getByRole('button', { name: /^Đoạn 1\.2/ }).click();
// sóng âm: canvas của cue có nhiều mức biên độ (không phẳng)
await page.waitForTimeout(1500);
const waveOk = await page.getByRole('slider', { name: /Vị trí phát Sấm sét/ }).locator('canvas').evaluate((cv) => {
  const g = cv.getContext('2d'); const w = cv.width, h = cv.height;
  const d = g.getImageData(0, 0, w, h).data; let colored = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) colored++;
  return colored / (w * h);
});
check('Sóng âm được vẽ (không chỉ là đường phẳng)', waveOk > 0.08, `fill=${waveOk.toFixed(3)}`);
// phát + tua bằng cách bấm vào sóng
await page.getByRole('button', { name: 'Phát Sấm sét / biến hình giật cục' }).click();
st = await waitStatus('Sấm sét / biến hình giật cục', /Playing/i);
const wf = page.getByRole('slider', { name: /Vị trí phát Sấm sét/ });
check('Sóng âm mở khóa khi đang phát', (await wf.getAttribute('aria-disabled')) === 'false', st);
await page.getByTestId('stop-all').click();
await page.getByRole('button', { name: /Tất cả đoạn/ }).click();

// Upload file thật (WAV sinh tại chỗ)
const wav = Buffer.alloc(44 + 8000 * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + 16000, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
for (let i = 0; i < 8000; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8) * 6000), 44 + i * 2);
await page.getByRole('button', { name: /Add Sounds/ }).click();
await page.locator('input[type=file][accept*=".wav"]').setInputFiles({ name: 'my-upload.wav', mimeType: 'audio/wav', buffer: wav });
const dlg = page.locator('[role=dialog], dialog').first();
await dlg.getByLabel('Tên âm thanh').fill('Âm tự upload');
await dlg.getByLabel('Cảnh kịch').fill('Cảnh 9');
await dlg.getByRole('button', { name: 'Save' }).click();
await page.getByText('Âm tự upload').first().waitFor({ timeout: 8000 });
check('Upload WAV thật -> xuất hiện trong danh sách', true);
await page.getByRole('button', { name: 'Phát Âm tự upload' }).click();
st = await waitStatus('Âm tự upload', /Playing/i);
check('Phát file vừa upload', /Playing/i.test(st), st);
await page.getByTestId('stop-all').click();

// Reload: dữ liệu còn, không tự phát
await page.reload();
await page.getByText('Âm tự upload').first().waitFor({ timeout: 8000 });
await page.getByText('Nhạc buồn não nề').first().waitFor();
const playingAfter = await page.getByTestId('status-badge').allInnerTexts();
check('Reload: dữ liệu còn nguyên (31 cue), không tự phát', playingAfter.length === 31 && playingAfter.every((x) => !/Playing/i.test(x)), playingAfter.join(','));
await page.getByRole('button', { name: 'Kích hoạt âm thanh' }).click();
await page.getByRole('button', { name: 'Phát Âm tự upload' }).click();
st = await waitStatus('Âm tự upload', /Playing/i);
check('Sau reload vẫn phát được file đã lưu (IndexedDB)', /Playing/i.test(st), st);
await page.getByTestId('stop-all').click();

// Xuất -> xóa sạch -> nhập lại tệp show
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Xuất/ }).click()]);
const showPath = '/tmp/e2e.stageshow';
await dl.saveAs(showPath);
const fsx = await import('node:fs');
const showSize = fsx.statSync(showPath).size;
check('Xuất tệp .stageshow', showSize > 1000, `${showSize} bytes`);
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Xóa toàn bộ dữ liệu demo' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('Nhạc mở màn'), null, { timeout: 8000 });
check('Xóa sạch dữ liệu', true);
await page.locator('input[type=file][accept=".stageshow"]').setInputFiles(showPath);
await page.getByText('Âm tự upload').first().waitFor({ timeout: 8000 });
await page.waitForTimeout(800); const cnt = await page.getByTestId('status-badge').count(); check('Nhập tệp show -> đủ 31 cue trở lại', cnt === 31, String(cnt));
await page.getByRole('button', { name: 'Phát Âm tự upload' }).click();
st = await waitStatus('Âm tự upload', /Playing/i);
check('Phát file sau khi nhập', /Playing/i.test(st), st);
await page.getByTestId('stop-all').click();
// File rác bị từ chối
fsx.writeFileSync('/tmp/bad.stageshow', 'garbage');
await page.locator('input[type=file][accept=".stageshow"]').setInputFiles('/tmp/bad.stageshow');
await page.getByText(/Nhập thất bại/).first().waitFor({ timeout: 5000 });
check('Tệp show sai định dạng bị từ chối', true);

// Xóa cue
page.on('dialog', (d) => d.accept());
await page.getByRole('button', { name: /Xóa Âm tự upload|Xóa$/ }).first().isVisible().catch(() => false);
await card('Âm tự upload').getByRole('button', { name: 'Xóa' }).click();
const confirmBtn = page.getByRole('button', { name: /^(Xóa|Delete|Xác nhận)/ }).last();
if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
await page.waitForFunction(() => !document.body.innerText.includes('Âm tự upload'), null, { timeout: 8000 }).then(() => check('Xóa cue -> biến mất', true), () => check('Xóa cue -> biến mất', false));

await page.screenshot({ path: '/tmp/demo1.png', fullPage: true });
check('Không có lỗi console/page', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
