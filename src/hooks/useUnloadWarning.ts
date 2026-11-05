import { useEffect } from 'react';

/**
 * Cảnh báo khi đóng/reload tab lúc đang phát. Trình duyệt quyết định có hiện hộp thoại hay không;
 * ứng dụng KHÔNG thể chặn việc đóng tab.
 */
export function useUnloadWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
