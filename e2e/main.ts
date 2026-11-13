// Trang kiểm thử e2e: engine thật + Howler thật + AudioContext thật; file âm thanh sinh tại chỗ (không cần Firebase).
import { AudioEngine } from '../src/audio/AudioEngine';
import { createHowlerDeps } from '../src/audio/howlerDeps';
import type { TrackConfig } from '../src/audio/types';

function makeWav(seconds: number, freq: number): Blob {
  const rate = 22050;
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * freq * i) / rate) * 8000, true);
  return new Blob([buf], { type: 'audio/wav' });
}

const cfg = (id: string, category: 'BGM' | 'SFX', seconds: number): TrackConfig => ({
  id, category, format: 'wav', storagePath: `x/${id}.wav`, fileSizeBytes: seconds * 44100,
  durationSeconds: seconds, defaultVolume: 1, loopDefault: false, trimStart: 0, trimEnd: 0, playbackRate: 1, fadeIn: 0, fadeOut: 0,
});

const engine = new AudioEngine(createHowlerDeps(), { tickMs: 50 });
const broken = new Set<string>();
engine.setBlobProvider(async (c) => {
  if (broken.has(c.id)) return new Blob([new Uint8Array(500).fill(7)], { type: 'audio/wav' }); // rác → lỗi giải mã
  return makeWav(c.durationSeconds, 220 + c.id.length * 110);
});
engine.syncSounds([
  cfg('bgmA', 'BGM', 8), cfg('bgmB', 'BGM', 8), cfg('bgmBad', 'BGM', 2),
  cfg('sfx1', 'SFX', 6), cfg('sfx2', 'SFX', 6), cfg('short', 'SFX', 1),
]);
broken.add('bgmBad');
Object.assign(window, { engine, snap: () => engine.getSnapshot(), cfgOf: cfg });
document.getElementById('gesture')!.addEventListener('click', () => void engine.unlock());
(window as unknown as { ready: boolean }).ready = true;
