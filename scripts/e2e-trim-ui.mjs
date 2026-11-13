// E2E UI cắt/tốc độ trên bản demo đã build (Chrome thật). Cần serve ở cổng 5199.
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://127.0.0.1:5199/';
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.getByRole('button', { name: 'Kích hoạt âm thanh' }).click();
await page.getByRole('button', { name: 'Tạo âm mẫu' }).click();
await page.getByText('Sấm sét / biến hình giật cục').first().waitFor({ timeout: 8000 });
const T = 'Sấm sét / biến hình giật cục';
const card = page.locator('li[data-testid^=audio-item-]').filter({ hasText: T });
const status = async () => (await card.getByTestId('status-badge').innerText()).trim();
const waitStatus = async (re, ms = 6000) => { const end = Date.now() + ms; let s; while (Date.now() < end) { s = await status(); if (re.test(s)) return s; await page.waitForTimeout(80); } return s; };

// 1) Tốc độ nhanh trên thẻ
const opts = await page.getByLabel(`Tốc độ ${T}`, { exact: true }).locator('option').allInnerTexts();
check('Có danh sách tốc độ preset', opts.length >= 5, opts.join(' '));
await page.getByLabel(`Tốc độ ${T}`, { exact: true }).selectOption({ label: '×1.5' });
check('Đặt ×1.5 -> hiện badge + nút ↺', (await card.getByText('×1.5').count()) > 0 && (await page.getByLabel(`Đặt lại tốc độ ${T}`).count()) === 1);
await page.getByLabel(`Đặt lại tốc độ ${T}`).click();
check('Bấm ↺ -> về ×1 (nút ↺ biến mất)', (await page.getByLabel(`Đặt lại tốc độ ${T}`).count()) === 0);

// 2) Mở modal Sửa
await card.getByRole('button', { name: 'Sửa' }).click();
const dlg = page.locator('[role=dialog]').first();
await dlg.waitFor();
await dlg.getByRole('slider', { name: 'Điểm bắt đầu' }).waitFor({ timeout: 5000 });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/trim-modal.png' });
const box = await dlg.boundingBox();
check('Modal nằm gọn trong màn hình 1360x900', box.y >= 0 && box.y + box.height <= 900 + 1, JSON.stringify(box));
const durText = await dlg.innerText();
check('Hiện thời lượng hiệu dụng', /thời lượng|Thời lượng|giây/i.test(durText));
// nhập số
const startIn = dlg.getByLabel(/Bắt đầu/); const endIn = dlg.getByLabel(/Kết thúc \(giây\)/);
await startIn.fill('0.2'); await startIn.press('Enter');
await endIn.fill('0.6'); await endIn.press('Enter');
check('Nhập 0.2–0.6 giây được chấp nhận', Number(await startIn.inputValue()) === 0.2 && Number(await endIn.inputValue()) === 0.6);
// nhập sai: end < start
await endIn.fill('0.1'); await endIn.press('Enter');
const endAfter = Number((await endIn.inputValue()).replace(',', '.'));
check('Kết thúc < bắt đầu bị kẹp (≥ start+0.1)', endAfter >= 0.3 - 1e-6, String(endAfter));
await endIn.fill('0.6'); await endIn.press('Enter');
// phím mũi tên trên tay cầm
const hs = dlg.getByRole('slider', { name: 'Điểm bắt đầu' });
await hs.focus(); await hs.press('ArrowRight'); await page.waitForTimeout(150);
check('Mũi tên dời điểm bắt đầu +0.05', Math.abs(Number((await startIn.inputValue()).replace(',', '.')) - 0.25) < 0.011, await startIn.inputValue());
// tốc độ ×2 trong modal
await dlg.getByRole('button', { name: /×1\.5/ }).click();
// nghe thử
await dlg.getByRole('button', { name: /Nghe thử/ }).click();
await page.waitForTimeout(200);
check('Nghe thử chạy (nút đổi thành Dừng)', (await dlg.getByRole('button', { name: /Dừng nghe thử/ }).count()) === 1);
await dlg.getByRole('button', { name: /Dừng nghe thử/ }).click();
// STOP ALL nổi trên modal
check('Nút STOP ALL nổi hiện khi mở modal', (await page.getByTestId('stop-all-modal').count()) === 1);
await dlg.getByRole('button', { name: 'Save' }).click();
await dlg.waitFor({ state: 'detached', timeout: 5000 });
check('Lưu xong modal đóng', true);
check('Thẻ hiện badge cắt + ×1.5', (await card.innerText()).includes('✂') && (await card.innerText()).includes('×1.5'), (await card.innerText()).replace(/\n/g, ' ').slice(0, 160));

// 3) Phát: 0.35s thực ≈ 0.4/1.5 = 0.27s
await page.getByRole('button', { name: `Phát ${T}` }).click();
await waitStatus(/Playing/i, 3000);
const t0 = Date.now();
const fin = await waitStatus(/Idle|Ended|Stopped/i, 4000);
check('Phát đoạn cắt rồi tự kết thúc nhanh (<1.2s)', /Idle|Ended|Stopped/i.test(fin) && Date.now() - t0 < 1200, `${fin} ${Date.now() - t0}ms`);

// 4) Khóa chỉnh khi đang phát
await page.getByLabel(`Lặp ${T}`).click().catch(() => {});
await page.getByRole('button', { name: `Phát ${T}` }).click();
await waitStatus(/Playing/i, 3000);
await card.getByRole('button', { name: 'Sửa' }).click();
const d2 = page.locator('[role=dialog]').first(); await d2.waitFor();
check('Đang phát: tay cầm cắt bị khóa', (await d2.getByRole('slider', { name: 'Điểm bắt đầu' }).getAttribute('aria-disabled')) === 'true' || (await d2.getByLabel(/Bắt đầu/).isDisabled()));
await page.screenshot({ path: '/tmp/trim-locked.png' });
await page.getByTestId('stop-all-modal').click();
await page.waitForTimeout(300);
check('STOP ALL nổi dừng âm khi modal mở', !/Playing/i.test(await status()), await status());
await d2.getByRole('button', { name: /Hủy|Cancel|Đóng/ }).first().click();

// 5) Bỏ cắt
await card.getByRole('button', { name: 'Sửa' }).click();
const d3 = page.locator('[role=dialog]').first(); await d3.waitFor();
await d3.getByRole('button', { name: 'Bỏ cắt' }).click();
await d3.getByRole('button', { name: 'Save' }).click(); await d3.waitFor({ state: 'detached' });
check('Bỏ cắt -> badge ✂ biến mất', !(await card.innerText()).includes('✂'));

// 6) Cắt lại, xuất -> xóa -> nhập: cắt/tốc độ còn nguyên
await card.getByRole('button', { name: 'Sửa' }).click();
const d4 = page.locator('[role=dialog]').first(); await d4.waitFor();
await d4.getByLabel(/Bắt đầu/).fill('0.3'); await d4.getByLabel(/Bắt đầu/).press('Enter');
await d4.getByRole('button', { name: /×1\.25/ }).click();
await d4.getByRole('button', { name: 'Save' }).click(); await d4.waitFor({ state: 'detached' });
const before = (await card.innerText()).match(/✂[^\n]*/)?.[0];
await page.reload();
await page.getByText(T).first().waitFor({ timeout: 8000 });
const afterReload = (await card.innerText()).match(/✂[^\n]*/)?.[0];
check('Reload: điểm cắt + tốc độ còn', !!before && before === afterReload && (await card.innerText()).includes('×1.25'), `${before} / ${afterReload}`);
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Xuất/ }).click()]);
await dl.saveAs('/tmp/trim.stageshow');
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Xóa toàn bộ dữ liệu demo' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('Sấm sét'), null, { timeout: 8000 });
await page.locator('input[type=file][accept=".stageshow"]').setInputFiles('/tmp/trim.stageshow');
await page.getByText(T).first().waitFor({ timeout: 8000 });
const afterImport = (await card.innerText());
check('Nhập tệp show: điểm cắt + ×1.25 còn nguyên', afterImport.includes('✂') && afterImport.includes('×1.25'), afterImport.replace(/\n/g, ' ').slice(0, 120));


// 6b) Fade in/out: nhập trong Sửa -> badge -> lưu qua reload và xuất/nhập
await card.getByRole('button', { name: 'Sửa' }).click();
const d6 = page.locator('[role=dialog]').first(); await d6.waitFor();
await d6.getByLabel('Fade in (giây)').fill('0.5');
await d6.getByLabel('Fade out (giây)').fill('1.2');
await d6.getByRole('button', { name: 'Save' }).click(); await d6.waitFor({ state: 'detached' });
check('Badge fade hiện ◢ 0.5s · 1.2s ◣', (await card.innerText()).includes('◢ 0.5s · 1.2s ◣'), (await card.innerText()).replace(/\n/g, ' ').slice(0, 140));
await page.reload();
await page.getByText(T).first().waitFor({ timeout: 8000 });
check('Reload: fade còn nguyên', (await card.innerText()).includes('◢ 0.5s · 1.2s ◣'));
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Xuất/ }).click()]);
await dl2.saveAs('/tmp/fade.stageshow');
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Xóa toàn bộ dữ liệu demo' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('Sấm sét'), null, { timeout: 8000 });
await page.locator('input[type=file][accept=".stageshow"]').setInputFiles('/tmp/fade.stageshow');
await page.getByText(T).first().waitFor({ timeout: 8000 });
check('Nhập tệp show: fade còn nguyên', (await card.innerText()).includes('◢ 0.5s · 1.2s ◣'));
// nhập giá trị xấu bị kẹp
await card.getByRole('button', { name: 'Sửa' }).click();
const d7 = page.locator('[role=dialog]').first(); await d7.waitFor();
await d7.getByLabel('Fade in (giây)').fill('99');
check('Fade in 99 bị kẹp về 10', (await d7.getByLabel('Fade in (giây)').inputValue()) === '10');
await d7.getByRole('button', { name: /Hủy|Cancel/ }).first().click();

// 6c) Giảm BGM: công tắc + nhớ lại sau reload
const duck = page.getByTestId('duck-control');
check('Có công tắc “Giảm BGM khi có SFX” (mặc định bật)', (await duck.getByRole('checkbox').isChecked()) === true);
await duck.getByRole('checkbox').uncheck();
await page.reload();
await page.getByText(T).first().waitFor({ timeout: 8000 });
check('Tắt giảm BGM được nhớ sau reload', (await page.getByTestId('duck-control').getByRole('checkbox').isChecked()) === false);
await page.getByTestId('duck-control').getByRole('checkbox').check();

// 6d) Không còn khung tóm tắt đoạn; thẻ SFX nhỏ gọn hơn
await page.getByRole('button', { name: /Đoạn 1\.1/ }).first().click().catch(() => {});
await page.waitForTimeout(300);
const bodyText = await page.locator('body').innerText();
check('Không còn khung tóm tắt (Nhân vật/Đạo cụ/Đã nạp trong đoạn)', !/NHÂN VẬT|Đã nạp trong đoạn này/i.test(bodyText));
const h = await page.locator('li[data-testid^=audio-item-]').nth(2).evaluate((el) => el.getBoundingClientRect().height);
check('Thẻ SFX cao ≤ 190px (trước đây ≈ 230+)', h <= 190, `${Math.round(h)}px`);
await page.screenshot({ path: '/tmp/ui-after.png' });

// 7) Điện thoại
await page.setViewportSize({ width: 390, height: 800 });
await card.getByRole('button', { name: 'Sửa' }).click();
const d5 = page.locator('[role=dialog]').first(); await d5.waitFor(); await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/trim-phone.png' });
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
check('Điện thoại 390px: không tràn ngang', sw <= 391, `scrollWidth=${sw}`);
check('Không có lỗi console/page', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
