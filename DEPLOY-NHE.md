# Cách nhẹ cho show một lần: 0 đồng, không backend

Không dùng Firebase. App chạy hoàn toàn trong trình duyệt của **một máy vận hành**; âm thanh lưu trong IndexedDB của máy đó. Chi phí: 0 (GitHub Pages miễn phí cho repo public; repo private cần gói trả phí, khi đó dùng Cloudflare Pages / Netlify free hoặc chạy thẳng từ USB, xem mục 3).

## 1. Đưa web lên GitHub Pages (một lần, 5 phút)
1. Tạo repo trên GitHub, `git push` mã nguồn lên nhánh `main`.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow `Deploy GitHub Pages (local mode)` tự chạy mỗi lần push (hoặc Actions → Run workflow).
4. Web có tại `https://<tài-khoản>.github.io/<repo>/`.

## 2. Quy trình trước show
1. Mở link trên **máy laptop sân khấu**, dùng Chrome.
2. **Add Sounds**: nạp toàn bộ file (MP3/WAV). Sửa tên, cảnh, thứ tự, âm lượng.
3. **⬇ Xuất (.stageshow)**: lưu tệp sao lưu vào USB/Drive. Làm lại mỗi khi sửa danh sách.
4. Mở lại trang ít nhất một lần khi còn mạng: service worker lưu giao diện để lần sau **mở được cả khi mất mạng** (chỉ trên HTTPS).
5. Ngày diễn: bấm **Kích hoạt âm thanh**, **Prepare Show**, **Test Sound**, rồi thử nhanh từng BGM/SFX.
6. Máy hỏng/đổi máy: mở link trên máy mới → **⬆ Nhập** tệp `.stageshow`.

## 3. Không có mạng ở nhà hát? Chạy từ USB
Dùng gói `stage-audio-demo.zip`: giải nén, chạy `start.bat` / `start.sh` (cần Node.js). Không cần Internet. Nhớ: dữ liệu gắn với `localhost:5173`; luôn dùng đúng cổng đó, và giữ tệp `.stageshow` để khôi phục.

## Đánh đổi so với bản Firebase
| | Local (cách nhẹ) | Firebase |
|---|---|---|
| Chi phí | 0 | Gói Blaze + Storage/băng thông |
| Thiết lập | ~5 phút | ~1 giờ (Auth, Rules, CORS, role) |
| Nhiều máy dùng chung thư viện | Không (chuyển bằng tệp `.stageshow`) | Có |
| Đăng nhập / phân quyền | Không có | admin / operator |
| Rủi ro mất dữ liệu | Xóa dữ liệu trình duyệt là mất → luôn giữ `.stageshow` | Nằm trên cloud |
| Phụ thuộc mạng lúc diễn | Không | Cần mạng để tải (trừ khi đã Prepare Show) |

Với một sự kiện, một máy vận hành, cách này là đủ và rủi ro thấp hơn (không có khâu mạng/quyền). Chỉ cần Firebase nếu nhiều người cùng quản lý thư viện từ nhiều máy.
