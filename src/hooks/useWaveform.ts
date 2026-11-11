import { useEffect, useState } from 'react';
import { fetchSoundBlob } from '../services/soundRepository';
import { loadPeaks } from '../utils/waveform';

/** Tính sóng âm (một lần, có cache) cho một cue. null = chưa có / không tính được. */
export function useWaveform(storagePath: string): Uint8Array | null {
  const [peaks, setPeaks] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let alive = true;
    setPeaks(null);
    void loadPeaks(storagePath, () => fetchSoundBlob(storagePath)).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
    };
  }, [storagePath]);
  return peaks;
}
