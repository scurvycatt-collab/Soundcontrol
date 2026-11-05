# Hướng dẫn deploy (Firebase Hosting qua GitHub)

Mỗi lần push lên nhánh `main`: GitHub Actions chạy typecheck + test → build → deploy Hosting + Firestore/Storage Rules lên Firebase.

## A. Tạo project Firebase (làm một lần, ~10 phút)
1. https://console.firebase.google.com → **Add project**.
2. **Nâng lên gói Blaze** (Build > Storage yêu cầu từ 2024-2025; có hạn mức miễn phí, nên đặt cảnh báo ngân sách).
3. **Authentication** → Get started → bật **Email/Password**. Tạo tài khoản cho bạn và vận hành viên (tab Users).
4. **Firestore Database** → Create database (chọn region gần, ví dụ `asia-southeast1`; production mode).
5. **Storage** → Get started (cùng region).
6. **Project settings → Your apps → Web (`</>`)** → đăng ký app, copy 6 giá trị `firebaseConfig`.

## B. Cấu hình CORS cho Storage (bắt buộc, vì app tải file bằng SDK)
Sau khi có link web (mục D), tạo `cors.json` từ `cors.example.json` rồi thay origin bằng `https://<project-id>.web.app` và `https://<project-id>.firebaseapp.com`:
```
gcloud storage buckets update gs://<bucket> --cors-file=cors.json
```
(`<bucket>` xem ở Storage, dạng `<project-id>.firebasestorage.app`.)

## C. Đẩy mã lên GitHub và cấu hình Secrets
1. Tạo repo **private** trên GitHub, rồi trong thư mục dự án:
```
git init && git add . && git commit -m "Stage Audio Control"
git branch -M main
git remote add origin https://github.com/<ban>/<repo>.git
git push -u origin main
```
(`.env*` đã bị gitignore; không commit khóa bí mật.)
2. Sửa `.firebaserc`: thay `THAY-BANG-PROJECT-ID` bằng project ID.
3. Tạo service account để GitHub deploy: Firebase Console → Project settings → **Service accounts** → *Generate new private key* (tải file JSON). Dán **toàn bộ nội dung** vào secret `FIREBASE_SERVICE_ACCOUNT`. Nếu deploy báo thiếu quyền, vào Google Cloud IAM cấp cho service account này các vai trò: *Firebase Hosting Admin*, *Firebase Rules Admin*, *Cloud Datastore Index Admin*, *Service Usage Consumer*.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, thêm 7 secret:
   `FIREBASE_SERVICE_ACCOUNT`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
5. (Tùy chọn) Settings → Environments → `production` → bắt buộc duyệt tay trước khi deploy.

## D. Deploy
Push lên `main` (hoặc tab **Actions → Test & Deploy → Run workflow**). Xong sẽ có web tại `https://<project-id>.web.app`. Quay lại mục B để cấu hình CORS rồi mới thử phát âm thanh.

## E. Cấp quyền cho người dùng (admin / operator)
Vai trò là custom claim, không tự cấp được từ web. Trên máy bạn, với file service account JSON:
```
export GOOGLE_APPLICATION_CREDENTIALS=/duong/dan/sa.json
npm run set-role -- <email> admin       # hoặc operator
```
Người dùng cần đăng xuất/đăng nhập lại để nhận quyền. Chi tiết xem README.

## F. Kiểm tra sau deploy
- Đăng nhập admin → Add Sounds → upload 1 MP3 → phát được (nếu lỗi tải: gần như chắc chắn là CORS).
- Đăng nhập tài khoản operator: phát được, nhưng không thấy Add/Sửa/Xóa.
- Thử trước giờ diễn, trên đúng máy và mạng sân khấu: Prepare Show, ngắt mạng sau khi preload rồi vẫn phát được.

## Lưu ý
- Security Rules tests chưa được chạy trong môi trường phát triển; trước khi dùng thật hãy chạy `npm run test:rules` trên máy có Java + tải được emulator.
- Muốn deploy tay thay vì GitHub: `npm i -g firebase-tools && firebase login && npm run deploy`.
