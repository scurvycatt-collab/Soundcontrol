interface CodedError {
  code?: unknown;
  message?: unknown;
}

function codeOf(err: unknown): string {
  const c = (err as CodedError | null)?.code;
  return typeof c === 'string' ? c : '';
}

/** Lỗi khi tải file từ Cloud Storage (getBlob) → thông báo rõ ràng, có hướng xử lý. */
export function describeStorageError(err: unknown): string {
  const code = codeOf(err);
  switch (code) {
    case 'storage/unauthorized':
    case 'storage/unauthenticated':
      return 'Không có quyền đọc file (kiểm tra đăng nhập, role admin/operator và Storage Rules).';
    case 'storage/object-not-found':
      return 'Không tìm thấy file trên Storage (có thể đã bị xóa).';
    case 'storage/canceled':
      return 'Đã hủy tải file.';
    case 'storage/quota-exceeded':
      return 'Đã vượt hạn mức Storage của dự án Firebase.';
    default:
      break;
  }
  const msg = String((err as CodedError | null)?.message ?? '');
  const isNetwork =
    err instanceof TypeError ||
    code === 'storage/unknown' ||
    code === 'storage/retry-limit-exceeded' ||
    /network|failed to fetch|cors|load failed/i.test(msg);
  if (isNetwork) {
    return 'Không tải được file: lỗi mạng hoặc bucket chưa cấu hình CORS cho origin này (xem README mục CORS).';
  }
  return `Không tải được file: ${msg || code || 'lỗi không xác định'}`;
}

export function describeFirestoreError(err: unknown): string {
  const code = codeOf(err);
  if (code === 'permission-denied') return 'Không có quyền truy cập dữ liệu (kiểm tra role và Firestore Rules).';
  if (code === 'unavailable') return 'Không kết nối được Firestore (mất mạng?).';
  if (code === 'failed-precondition') return 'Thiếu index Firestore cho truy vấn này.';
  const msg = String((err as CodedError | null)?.message ?? '');
  return `Lỗi Firestore: ${msg || code || 'không xác định'}`;
}

export function describeUploadError(err: unknown): string {
  const code = codeOf(err);
  switch (code) {
    case 'storage/canceled':
      return 'Đã hủy upload.';
    case 'storage/unauthorized':
      return 'Không có quyền upload (cần role admin; Storage Rules cũng giới hạn loại tệp và dung lượng).';
    case 'storage/quota-exceeded':
      return 'Đã vượt hạn mức Storage.';
    case 'storage/retry-limit-exceeded':
      return 'Upload thất bại do mạng không ổn định.';
    default:
      return `Upload thất bại: ${String((err as CodedError | null)?.message ?? code ?? 'lỗi không xác định')}`;
  }
}

export function describeAuthError(err: unknown): string {
  const code = codeOf(err);
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Email hoặc mật khẩu không đúng.';
    case 'auth/too-many-requests':
      return 'Quá nhiều lần thử. Vui lòng đợi một lúc rồi thử lại.';
    case 'auth/network-request-failed':
      return 'Không kết nối được mạng.';
    case 'auth/user-disabled':
      return 'Tài khoản đã bị vô hiệu hoá.';
    default:
      return `Đăng nhập thất bại: ${String((err as CodedError | null)?.message ?? code ?? 'lỗi không xác định')}`;
  }
}
