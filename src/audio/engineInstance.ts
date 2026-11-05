import { AudioEngine } from './AudioEngine';
import { createHowlerDeps } from './howlerDeps';

let instance: AudioEngine | null = null;

/** Một engine duy nhất cho cả ứng dụng (không gắn với vòng đời component → an toàn với StrictMode). */
export function getEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine(createHowlerDeps());
  return instance;
}

export function disposeEngine(): void {
  instance?.dispose();
  instance = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeEngine());
}
