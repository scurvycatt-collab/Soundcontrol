# 🎭 Stage Audio Control

Web app điều khiển **1 nhạc nền (BGM) + nhiều hiệu ứng (SFX)** cho vở kịch trực tiếp.
React + Vite + TypeScript (strict) · Tailwind · howler.js (Web Audio) · Firebase Auth / Firestore / Storage.

> **Phạm vi MVP:** một laptop/desktop (Chrome hoặc Edge) phát ra loa/mixer sân khấu. Firebase chỉ là kho file + metadata,
> **không** đồng bộ phát âm thanh giữa nhiều máy. Xem mục [Giới hạn đã biết](#giới-hạn-đã-biết).

---

## 1. Trade-off vận hành (đọc trước khi dùng cho show thật)

| Vấn đề | Quyết định | Hệ quả |
| --- | --- | --- |
| **Autoplay** | Không tự phát khi tải trang; phải bấm **“Kích hoạt âm thanh”** | Sau mỗi lần reload phải kích hoạt lại. Không có lệnh nào được xếp hàng chờ unlock. |
| **Tải file** | `getBlob()` qua Firebase SDK → Blob URL tạm → Howler giải mã | Tuân theo Auth/Storage Rules (không dùng link token). **Bắt buộc cấu hình CORS** (mục 4). |
| **RAM** | Web Audio giải mã **toàn bộ** file thành PCM float32 | MP3 10 phút ≈ 10 MB nhưng ≈ **210 MB RAM**. Toolbar hiển thị *file* và *≈RAM giải mã*; Prepare Show có 2 ngưỡng (250 MB file, 1024 MB RAM ước tính). Hãy Prepare theo từng cảnh và dùng “Giải phóng bộ nhớ”. |
| **Offline** | Cue đã Prepare xong vẫn phát được khi mất mạng *trong cùng phiên* | **Reload/đóng tab khi mất mạng = mất cue** (chưa có PWA/service worker). Đừng reload trong lúc diễn. |
| **BGM** | Chuyển bài cứng: tải xong bài mới → dừng bài cũ → phát bài mới. Không crossfade | Có độ trễ nếu bài mới chưa Prepare (hãy Prepare trước). |
| **Clipping** | howler.js **không có limiter** | Giữ Master ≤ 70% khi dò âm, kiểm tra trên mixer thật. |
| **Đa tab** | Chỉ cảnh báo best-effort bằng `BroadcastChannel` | Không phải khóa; không áp dụng giữa các máy khác nhau. |

**Khuyến cáo:** với buổi diễn quan trọng, luôn có phương án phát dự phòng cục bộ (file trên máy/USB). Ứng dụng web + Firebase không thay thế việc kiểm tra loa, cáp và nguồn điện.

---

## 2. Cấu trúc

```text
stage-audio-control/
├── src/
│   ├── app/App.tsx                    # AuthGate + màn hình điều khiển
│   ├── audio/
│   │   ├── AudioEngine.ts             # nguồn sự thật về phát (độc lập React, store subscribe/getSnapshot)
│   │   ├── types.ts                   # TrackConfig, EngineSnapshot, HowlLike, EngineDeps
│   │   ├── memory.ts                  # ước tính RAM giải mã
│   │   ├── howlerDeps.ts              # cầu nối howler.js (duy nhất chạm vào Howler)
│   │   └── engineInstance.ts          # singleton của app (an toàn StrictMode)
│   ├── auth/{AuthProvider,LoginScreen}.tsx
│   ├── components/                    # UI thuần: Header, Toolbar, AudioList, AudioItem, UploadModal, EditSoundModal,
│   │                                  #   ConfirmDialog, StatusBanner, BrokenSoundsPanel
│   ├── hooks/                         # useAudioEngine, useSounds, useAuth, useOnline, useTabGuard, useUnloadWarning
│   ├── services/                      # firebase, soundRepository, uploadService, deleteService, diagnostics
│   ├── types/sound.ts
│   ├── utils/                         # formatTime, validateAudio, soundDoc, errors
│   ├── styles/index.css · config.ts · main.tsx
├── scripts/set-user-role.mjs          # gán role (Admin SDK, chạy cục bộ)
├── tests/
│   ├── audio-engine/                  # engine + mock Howl (race condition, BGM/SFX, preload, soak)
│   ├── upload-workflow/               # upload/rollback/delete (backend giả)
│   ├── utils/ · components/           # tiện ích, component, tích hợp App (StrictMode)
│   └── security-rules/                # Firestore + Storage Rules — chạy bằng Emulator
├── firestore.rules · storage.rules · firestore.indexes.json · firebase.json · cors.example.json
└── .env.example · package.json · tsconfig.json · vite.config.ts · tailwind.config.js
```

Nguyên tắc: **không** có `new Howl()` trong component. `AudioItem` chỉ nhận snapshot và gọi hành động; `AudioEngine` sở hữu mọi Howl,
nên remount/lọc cảnh/đổi metadata không làm tắt hay nhân đôi âm thanh.

---

## 3. Cài đặt nhanh (dev cục bộ với Emulator, không cần tài khoản Firebase)

Yêu cầu: Node ≥ 20, Java (cho Emulator).

```bash
npm install
cp .env.example .env
# Sửa .env:  VITE_USE_EMULATORS=true  và  VITE_FIREBASE_PROJECT_ID=demo-stage-audio
# (các giá trị VITE_FIREBASE_* còn lại là placeholder bất kỳ, không bắt đầu bằng "your-")

npm run emulators          # terminal 1: Auth(9099) + Firestore(8080) + Storage(9199) + UI(4000)
npm run dev                # terminal 2: http://localhost:5173
```

Tạo user trong Emulator UI (http://localhost:4000 → Authentication), rồi cấp role:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node scripts/set-user-role.mjs --project demo-stage-audio --email admin@vidu.com --role admin
```

Đăng nhập → **Kích hoạt âm thanh** → **Add Sounds** để upload MP3/WAV → **Prepare Show** → điều khiển.

---

## 4. Thiết lập Firebase thật

1. **Tạo project** tại <https://console.firebase.google.com> (khuyến nghị gói Blaze nếu Storage yêu cầu; kiểm tra hạn mức).
2. **Authentication** → Sign-in method → bật **Email/Password**. Tạo tài khoản thủ công cho nhóm sân khấu (không có đăng ký công khai).
3. **Firestore Database** → Create database (production mode).
4. **Storage** → Get started. Ghi lại tên bucket (ví dụ `your-project-id.firebasestorage.app`).
5. **Web app**: Project settings → Your apps → thêm Web app → copy config vào `.env` (xem `.env.example`).
   Config web (apiKey, projectId…) **không phải bí mật**; hàng rào bảo vệ là Security Rules.
6. **Đăng nhập CLI & chọn project**:
   ```bash
   npx firebase login
   npx firebase use --add        # chọn project, đặt alias default
   ```
7. **Deploy Rules**: `npm run deploy:rules`
8. **Cấp role** (xem mục 5).
9. **CORS cho Storage** (bắt buộc cho `getBlob()`): sao chép `cors.example.json` → `cors.json`, thay `YOUR-PROJECT-ID` và liệt kê **đúng các origin cần dùng**
   (production + `http://localhost:5173`; **không dùng `*`**), rồi:
   ```bash
   gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json
   # hoặc: gsutil cors set cors.json gs://YOUR_BUCKET
   gcloud storage buckets describe gs://YOUR_BUCKET --format="default(cors_config)"   # kiểm tra
   ```
   Thay đổi CORS có thể mất vài phút để có hiệu lực.

## 5. Phân quyền (admin / operator)

Role là **custom claim** do Admin SDK gán — client không tự nâng quyền được. Ẩn nút trên UI **không** phải bảo mật; Rules mới là bảo mật.

```bash
# Cần service account của dự án (Console → Project settings → Service accounts → Generate new private key).
# Lưu NGOÀI repo, KHÔNG commit, KHÔNG đưa vào frontend / biến VITE_*.
export GOOGLE_APPLICATION_CREDENTIALS=/duong/dan/ngoai/repo/serviceAccount.json
node scripts/set-user-role.mjs --project YOUR_PROJECT_ID --email nguoi@vidu.com --role admin      # xem/phát/upload/sửa/xóa
node scripts/set-user-role.mjs --project YOUR_PROJECT_ID --email nsx@vidu.com   --role operator   # xem/phát
node scripts/set-user-role.mjs --project YOUR_PROJECT_ID --email x@vidu.com     --role none       # gỡ quyền
```

Người dùng cần **đăng xuất/đăng nhập lại** (hoặc bấm “Kiểm tra lại” trên màn hình chờ quyền) để token nhận role mới.

---

## 6. Lệnh

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Dev server (http://localhost:5173) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Unit + component + tích hợp (Vitest, không cần mạng/emulator) |
| `npm run e2e` | E2E với **Chrome thật + Howler thật + AudioContext thật** (headless, cần Google Chrome; dùng `playwright-core`, không tải browser) |
| `npm run test:rules` | Test Security Rules bằng Emulator (cần Java và tải được emulator jar) |
| `npm run build` | Typecheck + build production vào `dist/` |
| `npm run preview` | Xem bản build |
| `npm run deploy:rules` | Deploy Firestore/Storage Rules + indexes |
| `npm run deploy:hosting` | Build + deploy Firebase Hosting (HTTPS) |
| `npm run deploy` | Build + deploy tất cả |

Chọn **Firebase Hosting** làm hosting duy nhất (đã cấu hình trong `firebase.json`, SPA rewrite + cache header). Sau deploy, thêm origin
`https://<project>.web.app` và `.firebaseapp.com` vào CORS (mục 4.9) và vào **Authentication → Settings → Authorized domains** nếu cần.

---

## 7. Cách dùng khi vận hành

**Trước giờ diễn (≥ 30 phút):**
1. Mở app trên **đúng laptop + loa/mixer** sẽ dùng, bằng Chrome/Edge, tắt chế độ tiết kiệm pin, cắm sạc, tắt thông báo hệ thống.
2. Đăng nhập → **Kích hoạt âm thanh** → **Test Sound** (tone nhỏ, đi qua Master) → kiểm tra đúng thiết bị đầu ra của hệ điều hành.
3. **Prepare Show** (tất cả, hoặc theo từng cảnh nếu RAM hạn chế). Chờ `Preparing show: ready X/Y` đủ, không còn `Error`. Xử lý cue lỗi bằng **Retry**.
4. Chạy thử đủ cue; chỉnh âm lượng từng cue; kiểm tra clipping trên mixer.
5. Thử **ngắt mạng** sau khi Prepare: cue Ready vẫn phát; cue chưa tải báo `Not ready / Offline`. **Không reload.**
6. Chuẩn bị phương án dự phòng cục bộ.

**Trong show:** `Play/Pause`, `Stop` (về 0), `Replay` (phát lại cue đó từ 0, không chồng), seek bằng thanh tiến trình, `Loop`.
**STOP ALL** luôn khả dụng, không hỏi xác nhận: dừng BGM + mọi SFX và huỷ mọi lệnh đang chờ.

Quy tắc phát: tối đa **1 BGM**; mỗi SFX chỉ có **1 instance** (bấm lại = Pause/Resume; Replay = phát lại); tối đa **16 SFX** đồng thời
(`MAX_ACTIVE_SFX`), vượt thì báo “Đã đạt giới hạn SFX đồng thời” mà **không** dừng cue khác.

Admin: **Add Sounds** (upload có tiến độ và hủy), **Sửa** metadata, **Xóa** (có xác nhận; cue đang phát sẽ bị dừng trước). Mục **“Cần xử lý”**
liệt kê bản ghi xóa dở (`deleting`), document sai cấu trúc và file có thể mồ côi (có nút Retry/Xóa file).

Các ngưỡng nằm trong `src/config.ts` (`MAX_UPLOAD_MB=100`, `MAX_PRELOAD_TOTAL_MB=250`, `MAX_DECODED_RAM_MB=1024`, `MAX_ACTIVE_SFX=16`,
`DEFAULT_MASTER_VOLUME=0.7`) — đây là **giá trị đề xuất để benchmark**, hãy chỉnh theo máy diễn thực tế. Ngưỡng RAM giải mã là
bổ sung của bản triển khai, không có trong brief gốc.

---

## 8. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
| --- | --- |
| “Audio bị trình duyệt chặn — bấm Kích hoạt âm thanh” | Chính sách autoplay. Bấm **Kích hoạt âm thanh** (cần thao tác người dùng). Nếu trạng thái quay lại “Chưa kích hoạt” khi đang chạy, AudioContext bị hệ thống tạm dừng — bấm lại. |
| Có âm thanh trên máy nhưng không ra loa | Sai thiết bị đầu ra của hệ điều hành/trình duyệt. Chọn lại thiết bị, dùng **Test Sound**. Ứng dụng không đảm bảo chọn loa theo từng cue. |
| Cue báo “…bucket chưa cấu hình CORS…” | Chưa áp CORS cho origin đang dùng (mục 4.9). Kiểm tra origin chính xác (kể cả cổng) và đợi vài phút. |
| “Không có quyền đọc file / truy cập dữ liệu” | Tài khoản thiếu role `admin`/`operator`, hoặc token chưa làm mới (đăng xuất/đăng nhập), hoặc Rules chưa deploy. |
| Upload bị từ chối | Chỉ `.mp3/.wav` (hoa/thường đều được), nội dung phải đúng định dạng (kiểm tra magic bytes), ≤ 100 MiB, và cần role `admin`. |
| “Không giải mã được file” | File hỏng hoặc codec lạ. Xuất lại MP3/WAV PCM chuẩn. Thử **Retry**. |
| Cue “Not ready / Offline” | Chưa Prepare khi còn mạng. Khôi phục mạng rồi Prepare lại (không cần reload nếu app còn mở). |
| Trình duyệt chậm/treo khi Prepare | Vượt RAM. Prepare theo từng cảnh, dùng **Giải phóng bộ nhớ**, hạ `MAX_DECODED_RAM_MB` hoặc dùng file ngắn/ít kênh hơn. |
| Cảnh báo “tab khác đang phát” | Có tab thứ hai của app cùng profile đang phát. Đóng bớt, chỉ để một tab điều khiển. |
| Cue biến mất khỏi danh sách | Document sai cấu trúc hoặc đang `deleting`/`error` — admin xem mục “Cần xử lý”. |
| `The query requires an index` | Ứng dụng đọc cả collection rồi sắp xếp ở client nên thường không cần index. Nếu bạn thêm truy vấn khác, bổ sung vào `firestore.indexes.json` rồi `npm run deploy:rules`. |
| Lỗi mạng ở Firestore | Banner hiện nút **Thử lại**; danh sách hiện có được giữ nguyên, cue đã Ready vẫn phát. |
| `npm run test:rules` không chạy được | Cần Java và tải được emulator jar từ `storage.googleapis.com`. Trong môi trường chặn mạng ra ngoài, chạy ở máy khác. |

---

## 9. Kiểm thử & trạng thái nghiệm thu

Kết quả **thực sự đã chạy** trong lần build này (môi trường sandbox, Node 22):

- `npm run typecheck` → **pass** (TypeScript strict).
- `npm test` → **113/113 test pass** (5 file: engine + mock Howl, upload/delete, utils, component, tích hợp App trong StrictMode).
- `npm run build` → **pass**, bundle ≈ 898 kB (≈ 269 kB gzip; Firebase SDK chiếm phần lớn). Đã quét bundle: không có private key / service account.
- `npm run test:rules` → **CHƯA CHẠY ĐƯỢC** trong sandbox: không tải được Firestore Emulator jar (egress tới `storage.googleapis.com` bị chặn, HTTP 403).
  Các test Rules đã được viết (`tests/security-rules/rules.test.ts`) nhưng **chưa được xác nhận chạy**. Hãy chạy trên máy có mạng trước khi tin vào Rules.
- `npm run e2e` → **23/23 kiểm tra pass** với Chrome 153 headless + Howler thật + AudioContext thật (file WAV sinh tại chỗ): unlock bằng click thật,
  chuyển BGM, SFX song song, lỗi giải mã, pause/resume đúng vị trí, seek, replay x6, master/mute, STOP ALL, `onend` và loop thật, Prepare Show. Headless **không có thiết bị loa**,
  nên e2e xác nhận trạng thái + đồng hồ phát chạy thật, **không** xác nhận nghe được/độ lớn/clipping.
- **Chưa** deploy lên Firebase, **chưa** thử với Firebase thật, **chưa** nghe âm thanh qua loa. Test engine đơn vị dùng Howl giả (mô phỏng race condition) — **không thay thế** thử nghiệm bằng loa thật.

Legend: ✅ tested = có test tự động đã chạy · 🔎 manual = cần kiểm tra tay trên máy/loa thật · ⏳ chưa chạy được ở đây.

| ID | Trạng thái | Ghi chú |
| --- | --- | --- |
| A01 | implemented · ✅ tested (engine + UI + **Chrome thật**) | Không tự phát; banner + nút Kích hoạt. |
| A02 | implemented · ✅ tested (mock + **Chrome/Howler thật**) · 🔎 nghe thử | Unlock bằng click thật chạy đúng, Test Sound không lỗi. Cần nghe thử trên loa; Edge chưa thử. |
| A03 | implemented · ✅ tested (mock + **Howler thật**) | Chuyển BGM có kiểm soát, không chồng. |
| A04 | implemented · ✅ tested (mock) | Load/decode lỗi giữ BGM cũ, thu hồi Blob URL; play lỗi → khôi phục BGM cũ. |
| A05 | implemented · ✅ tested (mock) | Generation token + bgmSeq; load muộn chỉ đánh dấu `ready`. |
| A06 | implemented · ✅ tested (mock + UI + **Howler thật**) | |
| A07 | implemented · ✅ tested (mock) | Luôn `stop()` trước `play()`; 1 Howl/cue; replay khi đang tải không sinh lệnh thừa. |
| A08 | implemented · ✅ tested (mock) | Từ chối + báo rõ, không dừng cue khác; đếm không lệch. |
| A09 | implemented · ✅ tested (mock + **Howler thật**) | Resume đúng vị trí. |
| A10 | implemented · ✅ tested | Clamp; khóa tua khi chưa phát/duration không hợp lệ; NaN/∞ bị từ chối. |
| A11 | implemented · ✅ tested (mock + **Howler thật**) | `onend` và loop thật xác nhận. |
| A12 | implemented · ✅ tested (mock + Howler thật: trạng thái) · 🔎 nghe thử độ lớn | Master dùng gain toàn cục của Howler; không nhân vào volume từng cue, không ghi ngược metadata. |
| A13 | implemented · ✅ tested (engine + App) | Đổi metadata/lọc/remount không tạo lại Howl, không dừng nhạc. |
| A14 | implemented · ✅ tested | StrictMode: 1 subscription Firestore, 1 engine, cleanup cân bằng. |
| A15 | implemented · ✅ tested (backend giả) · ⏳ cần thử với Firebase thật/Emulator | Metadata chỉ ghi sau khi upload xong; không lưu URL token. |
| A16 | implemented · ✅ client validate tested · ⏳ Rules chưa chạy | Reject trước upload (đuôi, MIME, magic bytes, 100 MiB); Rules test đã viết. |
| A17 | implemented · ✅ tested (backend giả) | Rollback xóa file; nếu rollback lỗi → báo orphan + ghi nhật ký + panel xử lý. |
| A18 | implemented · logic ✅ tested · 🔎 manual UI | Confirm → stop → deleting → xóa Storage → xóa doc. |
| A19 | implemented · ✅ tested | Giữ bản ghi `deleting` để Retry; `object-not-found` coi là đã xóa. |
| A20 | implemented (Rules) · ⏳ test đã viết, **chưa chạy** | Chạy `npm run test:rules` ở máy có mạng. |
| A21 | implemented (Rules) · ⏳ test đã viết, **chưa chạy** | |
| A22 | implemented · ✅ tested (mock) · 🔎 manual | Cue đã tải không gọi mạng khi phát; cue chưa tải báo lỗi/Offline. Ngắt mạng thật cần thử tay. |
| A23 | implemented · ✅ thông báo lỗi tested · 🔎 manual | Cần thử với bucket chưa cấu hình CORS thật (một số trình duyệt báo lỗi CORS dưới dạng lỗi mạng chung → thông báo gộp cả hai nguyên nhân). |
| A24 | implemented · ✅ tested | Error + Retry; không giả `Playing`. |
| A25 | implemented · ✅ mô phỏng 500 thao tác (mock) · 🔎 manual 30–60 phút | Số Howl ≤ số cue, Blob URL cân bằng, BGM ≤ 1 xuyên suốt. Cần soak test thật. |
| A26 | build ✅ pass · quét secret ✅ · ⏳ **chưa deploy** | `npm run deploy` khi đã cấu hình project; Rules deploy được chưa kiểm chứng. |

---

## 10. Giới hạn đã biết

- Web audio **không phải** hệ thống realtime có độ trễ được bảo đảm; luôn thử trên laptop/loa/mixer của buổi diễn.
- Không có limiter chống clipping, không fade/ducking/crossfade (P1).
- Không có PWA/offline cache sau hard reload; Firestore chưa bật persistence cục bộ nên **danh sách cue cũng cần mạng khi mở lại trang**.
- Ước tính RAM giải mã giả định 44.1 kHz stereo float32 — là số ước tính thô.
- Bundle ≈ 900 kB (chưa tách chunk); đủ cho MVP nội bộ.
- Chưa cấu hình ESLint (chỉ dùng `tsc` strict + test).
- Hotkeys/Cue Sheet, đa thiết bị, remote-control: ngoài phạm vi MVP.
- Dùng CORS: không bao giờ đặt origin `*` cho bucket chứa dữ liệu riêng.


## Chế độ DEMO (chạy thử không cần Firebase)

- `npm run build:demo` → `release/stage-audio-demo/` (bản tĩnh + `serve.mjs` + `start.bat`/`start.sh` + `HUONG-DAN.md`).
- `npm run demo` build rồi chạy tại http://localhost:5173/.
- `npm run e2e:demo` (cần server demo đang chạy, `URL=...` nếu khác cổng): kiểm thử bản build bằng Chrome thật.
- Demo thay Firestore/Storage bằng IndexedDB của trình duyệt, bỏ Auth. **Không** kiểm tra được Security Rules/phân quyền/đa máy; AudioEngine, UI, upload workflow, STOP ALL dùng nguyên mã thật.
