import { useMemo, useSyncExternalStore } from 'react';
import { getEngine } from '../audio/engineInstance';
import type { AudioEngine } from '../audio/AudioEngine';
import type { EngineSnapshot } from '../audio/types';

/** UI chỉ đọc snapshot; engine là nguồn sự thật về playback. */
export function useAudioSnapshot(engine: AudioEngine): EngineSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

export function useAudioEngine(): { engine: AudioEngine; snapshot: EngineSnapshot } {
  const engine = useMemo(() => getEngine(), []);
  const snapshot = useAudioSnapshot(engine);
  return { engine, snapshot };
}
