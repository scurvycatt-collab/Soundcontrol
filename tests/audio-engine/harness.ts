import { AudioEngine } from '../../src/audio/AudioEngine';
import type {
  EngineDeps,
  EngineOptions,
  HowlFactoryOptions,
  HowlLike,
  TrackConfig,
} from '../../src/audio/types';

/** Howl giả mô phỏng onload/onplay/onend/onloaderror/onplayerror. */
export class FakeHowl implements HowlLike {
  playing = false;
  paused = false;
  position = 0;
  vol: number;
  looping: boolean;
  unloaded = false;
  playCalls = 0;
  stopCalls = 0;
  nextSoundId = 1;
  constructor(
    public id: string,
    public opts: HowlFactoryOptions,
    public totalDuration: number,
    public behaviour: { failPlay: boolean },
  ) {
    this.vol = opts.volume;
    this.looping = opts.loop;
  }
  play(soundId?: number): number {
    this.playCalls++;
    if (this.behaviour.failPlay) {
      this.opts.onplayerror(soundId ?? 0, 'blocked');
      return soundId ?? 0;
    }
    this.playing = true;
    this.paused = false;
    const sid = soundId ?? this.nextSoundId++;
    this.opts.onplay(sid);
    return sid;
  }
  pause(): this {
    if (this.playing) {
      this.playing = false;
      this.paused = true;
      this.opts.onpause(1);
    }
    return this;
  }
  stop(): this {
    this.stopCalls++;
    const wasActive = this.playing || this.paused;
    this.playing = false;
    this.paused = false;
    this.position = 0;
    if (wasActive) this.opts.onstop(1);
    return this;
  }
  seek(pos?: number): unknown {
    if (typeof pos === 'number') {
      this.position = pos;
      return this;
    }
    return this.position;
  }
  volume(v: number): this {
    this.vol = v;
    return this;
  }
  loop(l: boolean): this {
    this.looping = l;
    return this;
  }
  duration(): number {
    return this.totalDuration;
  }
  unload(): void {
    this.unloaded = true;
    this.playing = false;
    this.paused = false;
  }
  /** Mô phỏng hết bài tự nhiên. */
  finish(): void {
    if (!this.playing) return;
    if (this.looping) {
      this.position = 0;
      this.opts.onend(1);
      return;
    }
    this.playing = false;
    this.position = 0;
    this.opts.onend(1);
  }
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}
export function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const cfg = (id: string, category: 'BGM' | 'SFX', extra: Partial<TrackConfig> = {}): TrackConfig => ({
  id,
  category,
  format: 'mp3',
  storagePath: `sounds/${id}/x.mp3`,
  fileSizeBytes: 1_000_000,
  durationSeconds: 60,
  defaultVolume: 1,
  loopDefault: false,
  ...extra,
});

export interface Harness {
  engine: AudioEngine;
  howls: Map<string, FakeHowl>;
  createdHowls: FakeHowl[];
  ctx: { state: string };
  master: { volume: number; muted: boolean };
  /** Giữ blob của id cho tới khi gọi release (mô phỏng mạng chậm). */
  hold(id: string): Deferred<void>;
  failFetch(id: string, message?: string): void;
  failDecode(id: string): void;
  failPlay(id: string): void;
  fetchCalls: string[];
  revoked: string[];
  createdUrls: string[];
  testTones: number;
}

/** Cho các microtask (await trong engine) chạy xong. */
export const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

export function makeHarness(configs: TrackConfig[], options: EngineOptions = {}, opts: { unlocked?: boolean } = {}): Harness {
  const howls = new Map<string, FakeHowl>();
  const createdHowls: FakeHowl[] = [];
  const holds = new Map<string, Deferred<void>>();
  const fetchFail = new Map<string, string>();
  const decodeFail = new Set<string>();
  const playFail = new Set<string>();
  const durations = new Map(configs.map((c) => [c.id, c.durationSeconds]));
  const behaviours = new Map<string, { failPlay: boolean }>();

  const h: Harness = {
    engine: undefined as unknown as AudioEngine,
    howls,
    createdHowls,
    ctx: { state: opts.unlocked === false ? 'suspended' : 'running' },
    master: { volume: -1, muted: false },
    hold: (id) => {
      const d = deferred<void>();
      holds.set(id, d);
      return d;
    },
    failFetch: (id, message = 'network down') => void fetchFail.set(id, message),
    failDecode: (id) => void decodeFail.add(id),
    failPlay: (id) => {
      playFail.add(id);
      const b = behaviours.get(id);
      if (b) b.failPlay = true;
    },
    fetchCalls: [],
    revoked: [],
    createdUrls: [],
    testTones: 0,
  };

  const deps: EngineDeps = {
    createHowl(o) {
      const id = o.src.replace('blob:', '').split('#')[0];
      const behaviour = { failPlay: playFail.has(id) };
      behaviours.set(id, behaviour);
      const howl = new FakeHowl(id, o, durations.get(id) ?? 60, behaviour);
      howls.set(id, howl);
      createdHowls.push(howl);
      queueMicrotask(() => {
        if (decodeFail.has(id)) o.onloaderror(undefined, 'Decoding audio data failed.');
        else o.onload();
      });
      return howl;
    },
    unlockContext: async () => {
      h.ctx.state = 'running';
      return true;
    },
    getContextState: () => h.ctx.state,
    setMasterVolume: (v) => void (h.master.volume = v),
    setMasterMute: (m) => void (h.master.muted = m),
    playTestTone: () => void h.testTones++,
    createObjectURL: (b) => {
      const url = `blob:${(b as unknown as { __id: string }).__id}#${h.createdUrls.length}`;
      h.createdUrls.push(url);
      return url;
    },
    revokeObjectURL: (u) => void h.revoked.push(u),
  };

  h.engine = new AudioEngine(deps, { tickMs: 10_000, ...options });
  h.engine.setBlobProvider(async (c) => {
    h.fetchCalls.push(c.id);
    const hold = holds.get(c.id);
    if (hold) await hold.promise;
    const failure = fetchFail.get(c.id);
    if (failure) throw new Error(failure);
    return { __id: c.id } as unknown as Blob;
  });
  h.engine.syncSounds(configs);
  return h;
}

export const status = (h: Harness, id: string) => h.engine.getSnapshot().tracks[id]?.playbackStatus;
export const playingIds = (h: Harness) =>
  Object.values(h.engine.getSnapshot().tracks)
    .filter((t) => t.playbackStatus === 'playing')
    .map((t) => t.soundId)
    .sort();
