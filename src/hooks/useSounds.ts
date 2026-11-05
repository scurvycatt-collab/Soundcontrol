import { useCallback, useEffect, useState } from 'react';
import { subscribeSounds, type SoundsSnapshot } from '../services/soundRepository';
import { describeFirestoreError } from '../utils/errors';

export interface UseSoundsResult extends SoundsSnapshot {
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const EMPTY: SoundsSnapshot = { sounds: [], broken: [], invalid: [] };

/**
 * Đúng một subscription Firestore cho cả app. Khi lỗi, GIỮ nguyên danh sách hiện có
 * (không xóa cue đang dùng chỉ vì mất kết nối).
 */
export function useSounds(): UseSoundsResult {
  const [data, setData] = useState<SoundsSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeSounds(
      (snap) => {
        setData(snap);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError(describeFirestoreError(err));
      },
    );
    return unsub;
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...data, loading, error, retry };
}
