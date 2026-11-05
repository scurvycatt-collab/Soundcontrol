import {
  DEFAULT_MASTER_VOLUME,
  ENGINE_TICK_MS,
  MAX_ACTIVE_SFX,
  MAX_DECODED_RAM_BYTES,
  MAX_PRELOAD_TOTAL_BYTES,
  PRELOAD_CONCURRENCY,
} from '../config';
import { estimateDecodedBytes } from './memory';
import type { LoadPhase, PlaybackStatus, TrackRuntimeState } from '../types/sound';
import type {
  BlobProvider,
  EngineDeps,
  EngineOptions,
  EngineSnapshot,
  EngineState,
  HowlLike,
  Notice,
  NoticeLevel,
  PrepareProgress,
  PrepareResult,
  TrackConfig,
} from './types';

interface RestoreInfo {
  id: string;
  seek: number;
  wasPlaying: boolean;
}

interface Entry {
  cfg: TrackConfig;
  howl: HowlLike | null;
  blobUrl: string | null;
  loaded: boolean;
  status: PlaybackStatus;
  phase?: LoadPhase;
  seek: number;
  duration: number;
  volume: number;
  loop: boolean;
  volumeTouched: boolean;
  loopTouched: boolean;
  error?: string;
  loadPromise: Promise<boolean> | null;
  howlSoundId: number | null;
  /** Tăng mỗi khi có lệnh mới (play/pause/stop) cho track này → vô hiệu hoá lệnh play đang chờ tải. */
  token: number;
  restore?: RestoreInfo;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;

function sameTrack(a: TrackRuntimeState, b: TrackRuntimeState): boolean {
  return (
    a.soundId === b.soundId &&
    a.playbackStatus === b.playbackStatus &&
    a.seekSeconds === b.seekSeconds &&
    a.durationSeconds === b.durationSeconds &&
    a.volume === b.volume &&
    a.loop === b.loop &&
    a.loadPhase === b.loadPhase &&
    a.errorMessage === b.errorMessage
  );
}

/**
 * Nguồn sự thật duy nhất về phát âm thanh. Không phụ thuộc React.
 *
 * Bất biến:
 *  - Tối đa 1 BGM ở trạng thái `playing` (enforceBgmInvariant kiểm tra lại khi onplay).
 *  - Mỗi track chỉ có tối đa 1 instance phát (stop trước khi play lại).
 *  - STOP ALL tăng `generation` ⇒ mọi lệnh play đang chờ tải đều bị bỏ.
 */
export class AudioEngine {
  private readonly deps: EngineDeps;
  private readonly maxActiveSfx: number;
  private readonly maxPreloadBytes: number;
  private readonly maxDecodedBytes: number;
  private readonly preloadConcurrency: number;

  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot!: EngineSnapshot;

  private generation = 0;
  private bgmSeq = 0;
  private pendingBgmId: string | null = null;
  private activeBgmId: string | null = null;
  private activeSfx = new Set<string>();

  private engineState: EngineState = 'locked';
  private masterVolume: number;
  private masterMuted = false;
  private prepare: PrepareProgress = { running: false, total: 0, done: 0, failed: 0 };
  private notice: Notice | null = null;
  private noticeSeq = 0;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private blobProvider: BlobProvider | null = null;

  constructor(deps: EngineDeps, options: EngineOptions = {}) {
    this.deps = deps;
    this.maxActiveSfx = options.maxActiveSfx ?? MAX_ACTIVE_SFX;
    this.maxPreloadBytes = options.maxPreloadBytes ?? MAX_PRELOAD_TOTAL_BYTES;
    this.maxDecodedBytes = options.maxDecodedBytes ?? MAX_DECODED_RAM_BYTES;
    this.preloadConcurrency = options.preloadConcurrency ?? PRELOAD_CONCURRENCY;
    this.masterVolume = clamp01(options.initialMasterVolume ?? DEFAULT_MASTER_VOLUME);
    this.deps.setMasterVolume(this.masterVolume);
    this.deps.setMasterMute(false);
    this.snapshot = this.buildSnapshot();
    // Đồng hồ này CHỈ phục vụ UI (đọc seek, phát hiện context bị treo); âm thanh không phụ thuộc vào nó.
    this.timer = setInterval(() => this.tick(), options.tickMs ?? ENGINE_TICK_MS);
  }

  // ------------------------------------------------------------------ store API

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  setBlobProvider(provider: BlobProvider): void {
    this.blobProvider = provider;
  }

  dismissNotice(): void {
    if (this.notice) {
      this.notice = null;
      this.emit();
    }
  }

  // ------------------------------------------------------------------ metadata sync

  /** Đồng bộ danh sách cue từ Firestore. Không tạo lại Howl, không dừng âm thanh đang phát. */
  syncSounds(configs: readonly TrackConfig[]): void {
    if (this.disposed) return;
    const next = new Set(configs.map((c) => c.id));
    for (const id of [...this.entries.keys()]) {
      if (!next.has(id)) this.removeEntry(id);
    }
    for (const cfg of configs) {
      const e = this.entries.get(cfg.id);
      if (!e) {
        this.entries.set(cfg.id, this.createEntry(cfg));
        continue;
      }
      const wasActive = e.status === 'playing' || e.status === 'paused';
      if (e.cfg.category !== cfg.category && wasActive) {
        this.haltTrack(e);
        this.pushNotice('warn', 'Một âm thanh đã bị dừng vì thay đổi nhóm BGM/SFX.');
      }
      if (e.cfg.storagePath !== cfg.storagePath && !wasActive && e.status !== 'loading') {
        this.unloadEntry(e);
      }
      e.cfg = cfg;
      if (!e.volumeTouched && !wasActive) {
        e.volume = clamp01(cfg.defaultVolume);
        e.howl?.volume(e.volume);
      }
      if (!e.loopTouched && !wasActive) {
        e.loop = cfg.loopDefault;
        e.howl?.loop(e.loop);
      }
      if (e.duration === 0 && cfg.durationSeconds > 0) e.duration = cfg.durationSeconds;
    }
    this.emit();
  }

  // ------------------------------------------------------------------ audio unlock

  /** Phải được gọi từ một thao tác người dùng (click). */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const ok = await this.deps.unlockContext();
      this.engineState = ok ? 'ready' : 'locked';
      if (!ok) this.pushNotice('warn', 'Trình duyệt vẫn chặn âm thanh — hãy bấm “Kích hoạt âm thanh” lại.');
      this.emit();
      return ok;
    } catch (err) {
      this.engineState = 'error';
      this.pushNotice('error', `Không kích hoạt được âm thanh: ${errMsg(err)}`);
      this.emit();
      return false;
    }
  }

  testSound(): boolean {
    if (!this.requireUnlocked()) return false;
    try {
      this.deps.playTestTone();
      return true;
    } catch (err) {
      this.pushNotice('error', `Test Sound lỗi: ${errMsg(err)}`);
      return false;
    }
  }

  // ------------------------------------------------------------------ commands

  /** Play/Pause theo trạng thái. */
  toggle(id: string): Promise<boolean> | boolean {
    const e = this.entries.get(id);
    if (!e || this.disposed) return false;
    switch (e.status) {
      case 'playing':
        return this.pause(id);
      case 'paused':
        return this.resume(id);
      case 'loading':
        return false; // idempotent: lệnh play đang chờ tải, bấm lại không tạo thêm lệnh
      case 'error':
        return false; // dùng retry()
      default:
        return this.startTrack(id);
    }
  }

  play(id: string): Promise<boolean> | boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    if (e.status === 'playing' || e.status === 'loading') return false;
    if (e.status === 'paused') return this.resume(id);
    if (e.status === 'error') return false;
    return this.startTrack(id);
  }

  pause(id: string): boolean {
    const e = this.entries.get(id);
    if (!e || this.disposed) return false;
    e.token++; // huỷ lệnh play đang chờ (nếu có)
    this.activeSfx.delete(id);
    if (e.status === 'playing' && e.howl) {
      e.seek = round2(this.readSeek(e));
      try {
        e.howl.pause(e.howlSoundId ?? undefined);
      } catch (err) {
        this.pushNotice('error', `Không tạm dừng được: ${errMsg(err)}`);
      }
      e.status = 'paused';
    }
    this.emit();
    return true;
  }

  stop(id: string): boolean {
    const e = this.entries.get(id);
    if (!e || this.disposed) return false;
    this.haltTrack(e);
    this.emit();
    return true;
  }

  /** Dừng chính sound này, về 0 rồi phát lại; không tạo instance mới chồng lên. */
  replay(id: string): Promise<boolean> | boolean {
    const e = this.entries.get(id);
    if (!e || this.disposed) return false;
    if (e.status === 'error') return false;
    this.haltTrack(e);
    return this.startTrack(id);
  }

  /** STOP ALL: dừng mọi thứ, huỷ mọi lệnh đang chờ. Luôn khả dụng, không bao giờ bị chặn. */
  stopAll(): void {
    if (this.disposed) return;
    this.generation++;
    this.bgmSeq++;
    this.pendingBgmId = null;
    for (const e of this.entries.values()) this.haltTrack(e);
    this.activeSfx.clear();
    this.activeBgmId = null;
    this.emit();
  }

  seek(id: string, seconds: number): boolean {
    const e = this.entries.get(id);
    if (!e || !e.howl || !e.loaded || this.disposed) return false;
    if (e.status !== 'playing' && e.status !== 'paused') return false;
    const duration = e.duration;
    if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return false;
    const clamped = Math.min(duration, Math.max(0, seconds));
    try {
      e.howl.seek(clamped);
    } catch (err) {
      this.pushNotice('error', `Không tua được: ${errMsg(err)}`);
      return false;
    }
    e.seek = round2(clamped);
    this.emit();
    return true;
  }

  setTrackVolume(id: string, volume: number): void {
    const e = this.entries.get(id);
    if (!e || this.disposed) return;
    e.volume = clamp01(volume);
    e.volumeTouched = true;
    e.howl?.volume(e.volume);
    this.emit();
  }

  setLoop(id: string, loop: boolean): void {
    const e = this.entries.get(id);
    if (!e || this.disposed) return;
    e.loop = loop;
    e.loopTouched = true;
    e.howl?.loop(loop);
    this.emit();
  }

  setMasterVolume(volume: number): void {
    if (this.disposed) return;
    this.masterVolume = clamp01(volume);
    this.deps.setMasterVolume(this.masterVolume);
    this.emit();
  }

  setMasterMute(muted: boolean): void {
    if (this.disposed) return;
    this.masterMuted = muted;
    this.deps.setMasterMute(muted);
    this.emit();
  }

  // ------------------------------------------------------------------ loading / preparing

  /** Thử tải lại một cue bị lỗi. */
  async retry(id: string): Promise<boolean> {
    const e = this.entries.get(id);
    if (!e || this.disposed) return false;
    if (e.loaded) {
      if (e.status === 'error') {
        e.status = 'ready';
        e.error = undefined;
        this.emit();
      }
      return true;
    }
    if (e.status === 'error') e.status = 'idle';
    e.error = undefined;
    return this.ensureLoaded(e);
  }

  /** Tải + giải mã trước các cue, có giới hạn bộ nhớ. Không phát gì. */
  async prepareShow(ids: readonly string[]): Promise<PrepareResult> {
    const result: PrepareResult = { requested: 0, ready: 0, failed: [], skipped: [] };
    if (this.disposed) return result;
    if (this.prepare.running) {
      this.pushNotice('warn', 'Đang chuẩn bị show, vui lòng đợi.');
      return result;
    }
    const targets = ids.map((id) => this.entries.get(id)).filter((e): e is Entry => Boolean(e));
    result.requested = targets.length;

    let used = this.loadedBytes();
    let usedDecoded = this.estimatedRamBytes();
    const queue: Entry[] = [];
    for (const e of targets) {
      if (e.loaded) {
        result.ready++;
        continue;
      }
      const decoded = estimateDecodedBytes(e.cfg);
      if (used + e.cfg.fileSizeBytes > this.maxPreloadBytes || usedDecoded + decoded > this.maxDecodedBytes) {
        result.skipped.push(e.cfg.id);
        continue;
      }
      used += e.cfg.fileSizeBytes;
      usedDecoded += decoded;
      queue.push(e);
    }
    const queued = queue.length;
    this.prepare = { running: true, total: queued, done: 0, failed: 0 };
    this.emit();

    const worker = async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const ok = await this.ensureLoaded(e);
        if (!ok) result.failed.push(e.cfg.id);
        this.prepare = { ...this.prepare, done: this.prepare.done + 1, failed: result.failed.length };
        this.emit();
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.preloadConcurrency, queued) }, worker));

    result.ready += queued - result.failed.length;
    this.prepare = { ...this.prepare, running: false };
    if (!this.disposed) {
      const parts = [`Sẵn sàng ${result.ready}/${result.requested}`];
      if (result.failed.length) parts.push(`${result.failed.length} lỗi`);
      if (result.skipped.length) {
        parts.push(`${result.skipped.length} chưa tải vì vượt ngân sách bộ nhớ preload — hãy chuẩn bị theo từng cảnh`);
      }
      this.pushNotice(result.failed.length || result.skipped.length ? 'warn' : 'info', `Prepare Show: ${parts.join(' · ')}.`);
      this.emit();
    }
    return result;
  }

  /** Giải phóng bộ nhớ các cue đã tải nhưng không phát/tạm dừng/đang tải. Trả về số cue đã giải phóng. */
  unloadTracks(ids: readonly string[]): number {
    let n = 0;
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e || !e.loaded) continue;
      if (e.status === 'playing' || e.status === 'paused' || e.status === 'loading') continue;
      this.unloadEntry(e);
      n++;
    }
    if (n) this.emit();
    return n;
  }

  // ------------------------------------------------------------------ lifecycle

  dispose(): void {
    if (this.disposed) return;
    this.generation++;
    this.bgmSeq++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const e of this.entries.values()) {
      e.token++;
      this.unloadEntry(e);
    }
    this.entries.clear();
    this.activeSfx.clear();
    this.disposed = true;
    this.listeners.clear();
  }

  /** Chỉ dùng cho test/diagnostics. */
  debugCounts(): { entries: number; howls: number; blobUrls: number; activeSfx: number } {
    let howls = 0;
    let blobUrls = 0;
    for (const e of this.entries.values()) {
      if (e.howl) howls++;
      if (e.blobUrl) blobUrls++;
    }
    return { entries: this.entries.size, howls, blobUrls, activeSfx: this.activeSfx.size };
  }

  // ================================================================== internals

  private createEntry(cfg: TrackConfig): Entry {
    return {
      cfg,
      howl: null,
      blobUrl: null,
      loaded: false,
      status: 'idle',
      seek: 0,
      duration: cfg.durationSeconds,
      volume: clamp01(cfg.defaultVolume),
      loop: cfg.loopDefault,
      volumeTouched: false,
      loopTouched: false,
      loadPromise: null,
      howlSoundId: null,
      token: 0,
    };
  }

  private removeEntry(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.haltTrack(e);
    this.unloadEntry(e);
    this.entries.delete(id);
    this.activeSfx.delete(id);
    if (this.activeBgmId === id) this.activeBgmId = null;
    if (this.pendingBgmId === id) this.pendingBgmId = null;
  }

  private unloadEntry(e: Entry): void {
    const howl = e.howl;
    e.howl = null;
    e.loaded = false;
    e.howlSoundId = null;
    if (howl) {
      try {
        howl.stop();
      } catch {
        /* bỏ qua */
      }
      try {
        howl.unload();
      } catch {
        /* bỏ qua */
      }
    }
    if (e.blobUrl) {
      this.deps.revokeObjectURL(e.blobUrl);
      e.blobUrl = null;
    }
    if (e.status !== 'loading') {
      e.status = 'idle';
      e.seek = 0;
      e.phase = undefined;
    }
  }

  private requireUnlocked(): boolean {
    if (this.deps.getContextState() === 'running') {
      if (this.engineState !== 'ready') {
        this.engineState = 'ready';
        this.emit();
      }
      return true;
    }
    this.engineState = 'locked';
    this.pushNotice('warn', 'Audio bị trình duyệt chặn — bấm Kích hoạt âm thanh.');
    return false;
  }

  /**
   * Bắt đầu phát một track từ đầu. Trả true nếu lệnh play đã được gửi tới engine (trạng thái `playing`
   * chỉ được xác nhận qua sự kiện onplay), false nếu bị từ chối/huỷ/lỗi.
   */
  private async startTrack(id: string): Promise<boolean> {
    const e = this.entries.get(id);
    if (!e || this.disposed) return false;
    if (!this.requireUnlocked()) return false;

    const isBgm = e.cfg.category === 'BGM';
    if (!isBgm && !this.activeSfx.has(id) && this.activeSfx.size >= this.maxActiveSfx) {
      this.pushNotice('warn', 'Đã đạt giới hạn SFX đồng thời');
      return false;
    }

    const gen = this.generation;
    const token = ++e.token;
    let seq = 0;
    if (isBgm) {
      seq = ++this.bgmSeq;
      this.pendingBgmId = id;
    } else {
      this.activeSfx.add(id);
    }
    const isStale = (): boolean =>
      this.disposed ||
      gen !== this.generation ||
      token !== e.token ||
      this.entries.get(id) !== e ||
      (isBgm && seq !== this.bgmSeq);
    this.emit();

    const ok = await this.ensureLoaded(e);

    if (!ok) {
      if (isBgm && seq === this.bgmSeq) this.pendingBgmId = null; // BGM đang phát (nếu có) được giữ nguyên
      if (!isBgm && token === e.token) this.activeSfx.delete(id);
      this.emit();
      return false;
    }
    if (isStale()) {
      // Bị thay thế bởi lệnh mới hoặc STOP ALL: chỉ đánh dấu ready (ensureLoaded đã làm), không tự phát.
      this.emit();
      return false;
    }

    if (isBgm) {
      this.pendingBgmId = null;
      const prevId = this.activeBgmId;
      let restore: RestoreInfo | undefined;
      if (prevId && prevId !== id) {
        const prev = this.entries.get(prevId);
        if (prev) {
          restore = {
            id: prevId,
            seek: prev.status === 'playing' ? this.readSeek(prev) : prev.seek,
            wasPlaying: prev.status === 'playing',
          };
          this.haltTrack(prev);
        }
      }
      this.activeBgmId = id;
      e.restore = restore;
    }
    const started = this.beginPlayback(e);
    this.emit();
    return started;
  }

  private beginPlayback(e: Entry): boolean {
    const howl = e.howl;
    if (!howl) return false;
    try {
      howl.stop(); // đảm bảo 1 instance/track và reset vị trí
      howl.volume(e.volume);
      howl.loop(e.loop);
      e.seek = 0;
      e.howlSoundId = howl.play();
      return true;
    } catch (err) {
      this.failPlayback(e, `Không phát được: ${errMsg(err)}`);
      return false;
    }
  }

  private resume(id: string): boolean {
    const e = this.entries.get(id);
    if (!e || !e.howl || this.disposed) return false;
    if (!this.requireUnlocked()) return false;
    const isBgm = e.cfg.category === 'BGM';
    if (!isBgm && this.activeSfx.size >= this.maxActiveSfx) {
      this.pushNotice('warn', 'Đã đạt giới hạn SFX đồng thời');
      return false;
    }
    if (isBgm) {
      // Resume là lệnh mới nhất: huỷ BGM khác đang chờ chuyển.
      this.bgmSeq++;
      this.pendingBgmId = null;
      this.activeBgmId = id;
    } else {
      this.activeSfx.add(id);
    }
    e.token++;
    try {
      e.howlSoundId = e.howl.play(e.howlSoundId ?? undefined);
    } catch (err) {
      this.failPlayback(e, `Không phát tiếp được: ${errMsg(err)}`);
      return false;
    }
    this.emit();
    return true;
  }

  /** Dừng + về 0 + huỷ lệnh đang chờ của một track. */
  private haltTrack(e: Entry): void {
    e.token++;
    const id = e.cfg.id;
    if (e.howl && (e.status === 'playing' || e.status === 'paused')) {
      try {
        e.howl.stop();
      } catch {
        /* bỏ qua */
      }
    }
    if (e.loaded && e.status !== 'loading' && e.status !== 'error') e.status = 'ready';
    e.seek = 0;
    e.restore = undefined;
    this.activeSfx.delete(id);
    if (this.activeBgmId === id) this.activeBgmId = null;
    if (this.pendingBgmId === id) {
      this.pendingBgmId = null;
      this.bgmSeq++;
    }
  }

  private failPlayback(e: Entry, message: string): void {
    const id = e.cfg.id;
    e.status = 'error';
    e.error = message;
    e.seek = 0;
    this.activeSfx.delete(id);
    if (this.activeBgmId === id) this.activeBgmId = null;
    this.pushNotice('error', `${message}`);
    const restore = e.restore;
    e.restore = undefined;
    if (restore?.wasPlaying) this.restoreBgm(restore);
  }

  /** Phát lại BGM cũ nếu BGM mới không phát được. Không bao giờ tạo 2 BGM song song. */
  private restoreBgm(r: RestoreInfo): void {
    const prev = this.entries.get(r.id);
    if (!prev || !prev.howl || !prev.loaded || this.disposed) return;
    if (this.deps.getContextState() !== 'running') return;
    try {
      prev.howl.stop();
      prev.howl.seek(r.seek);
      this.activeBgmId = r.id;
      prev.howlSoundId = prev.howl.play();
      this.pushNotice('warn', 'BGM mới không phát được — đã khôi phục BGM trước đó.');
    } catch {
      this.activeBgmId = null;
    }
  }

  /** Phòng thủ: nếu vì lý do nào đó có BGM thứ hai đang phát, dừng nó. */
  private enforceBgmInvariant(exceptId: string): void {
    for (const other of this.entries.values()) {
      if (other.cfg.category !== 'BGM' || other.cfg.id === exceptId) continue;
      if (other.status === 'playing') {
        console.warn('[AudioEngine] Phát hiện 2 BGM cùng phát; dừng', other.cfg.id);
        this.haltTrack(other);
      }
    }
  }

  private ensureLoaded(e: Entry): Promise<boolean> {
    if (e.loaded && e.howl) return Promise.resolve(true);
    if (e.loadPromise) return e.loadPromise;
    e.status = 'loading';
    e.phase = 'downloading';
    e.error = undefined;
    this.emit();
    const p = this.loadEntry(e).finally(() => {
      if (e.loadPromise === p) e.loadPromise = null;
    });
    e.loadPromise = p;
    return p;
  }

  private async loadEntry(e: Entry): Promise<boolean> {
    const id = e.cfg.id;
    const fail = (message: string): false => {
      if (this.entries.get(id) === e && !this.disposed) {
        e.status = 'error';
        e.phase = undefined;
        e.error = message;
        this.pushNotice('error', `Lỗi tải cue: ${message}`);
        this.emit();
      }
      return false;
    };
    const stillCurrent = () => !this.disposed && this.entries.get(id) === e;

    if (!this.blobProvider) return fail('Chưa cấu hình nguồn tải file.');

    let blob: Blob;
    try {
      blob = await this.blobProvider(e.cfg);
    } catch (err) {
      return fail(errMsg(err));
    }
    if (!stillCurrent()) return false;

    e.phase = 'decoding';
    this.emit();
    const url = this.deps.createObjectURL(blob);

    let resolveLoad!: () => void;
    let rejectLoad!: (err: Error) => void;
    const loadedPromise = new Promise<void>((res, rej) => {
      resolveLoad = res;
      rejectLoad = rej;
    });
    const owner: { howl?: HowlLike } = {};
    const owns = () => Boolean(owner.howl) && e.howl === owner.howl && stillCurrent();

    let howl: HowlLike;
    try {
      howl = this.deps.createHowl({
        src: url,
        format: e.cfg.format,
        volume: e.volume,
        loop: e.loop,
        onload: () => resolveLoad(),
        onloaderror: (_i, err) => rejectLoad(new Error(String(err ?? 'unknown'))),
        onplay: () => {
          if (!owns()) return;
          e.status = 'playing';
          e.error = undefined;
          e.restore = undefined;
          if (e.cfg.category === 'BGM') {
            this.enforceBgmInvariant(id);
            this.activeBgmId = id;
          } else {
            this.activeSfx.add(id);
          }
          this.emit();
        },
        onpause: () => {
          if (!owns()) return;
          if (e.status === 'playing') {
            e.status = 'paused';
            this.activeSfx.delete(id);
            this.emit();
          }
        },
        onstop: () => {
          if (!owns()) return;
          if (e.status === 'playing' || e.status === 'paused') {
            e.status = 'ready';
            e.seek = 0;
            this.activeSfx.delete(id);
            this.emit();
          }
        },
        onend: () => {
          if (!owns() || e.loop) return; // loop: Howler phát lại, giữ nguyên trạng thái playing
          e.status = 'ended';
          e.seek = 0;
          this.activeSfx.delete(id);
          if (this.activeBgmId === id) this.activeBgmId = null;
          this.emit();
        },
        onplayerror: (_i, err) => {
          if (!owns()) return;
          owner.howl?.off?.('unlock'); // không để Howler tự phát lại bất ngờ sau khi unlock
          this.failPlayback(e, `Trình duyệt không phát được âm thanh: ${String(err ?? '')}`.trim());
          this.emit();
        },
      });
    } catch (err) {
      this.deps.revokeObjectURL(url);
      return fail(`Không tạo được trình phát: ${errMsg(err)}`);
    }
    owner.howl = howl;

    try {
      await loadedPromise;
    } catch (err) {
      try {
        howl.unload();
      } catch {
        /* bỏ qua */
      }
      this.deps.revokeObjectURL(url);
      return fail(`Không giải mã được file: ${errMsg(err)}`);
    }

    if (!stillCurrent()) {
      try {
        howl.unload();
      } catch {
        /* bỏ qua */
      }
      this.deps.revokeObjectURL(url);
      return false;
    }

    e.howl = howl;
    e.blobUrl = url;
    e.loaded = true;
    e.phase = undefined;
    const d = howl.duration();
    if (Number.isFinite(d) && d > 0) e.duration = d;
    if (e.status === 'loading') e.status = 'ready';
    this.emit();
    return true;
  }

  private readSeek(e: Entry): number {
    try {
      const s = e.howl?.seek();
      if (typeof s === 'number' && Number.isFinite(s)) return s;
    } catch {
      /* bỏ qua */
    }
    return e.seek;
  }

  private loadedBytes(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.loaded) n += e.cfg.fileSizeBytes;
    return n;
  }

  private estimatedRamBytes(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.loaded) n += estimateDecodedBytes(e.cfg);
    return n;
  }

  private tick(): void {
    if (this.disposed) return;
    let changed = false;
    if (this.engineState === 'ready' && this.deps.getContextState() !== 'running') {
      this.engineState = 'locked';
      this.pushNotice('warn', 'AudioContext bị tạm dừng bởi trình duyệt — bấm Kích hoạt âm thanh.');
      changed = true;
    }
    for (const e of this.entries.values()) {
      if (e.status !== 'playing' || !e.howl) continue;
      const s = round2(this.readSeek(e));
      if (s !== e.seek) {
        e.seek = s;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private pushNotice(level: NoticeLevel, message: string): void {
    this.notice = { id: ++this.noticeSeq, level, message };
    this.emit(); // luôn phát snapshot để UI thấy thông báo, kể cả khi lệnh bị từ chối sớm
  }

  private trackState(e: Entry): TrackRuntimeState {
    return {
      soundId: e.cfg.id,
      playbackStatus: e.status,
      seekSeconds: e.seek,
      durationSeconds: e.duration,
      volume: e.volume,
      loop: e.loop,
      loadPhase: e.status === 'loading' ? e.phase : undefined,
      errorMessage: e.status === 'error' ? e.error : undefined,
    };
  }

  private buildSnapshot(): EngineSnapshot {
    const prev = this.snapshot?.tracks;
    const tracks: Record<string, TrackRuntimeState> = {};
    let anyPlaying = false;
    for (const [id, e] of this.entries) {
      const next = this.trackState(e);
      const old = prev?.[id];
      tracks[id] = old && sameTrack(old, next) ? old : next;
      if (e.status === 'playing') anyPlaying = true;
    }
    return {
      engineState: this.engineState,
      masterVolume: this.masterVolume,
      masterMuted: this.masterMuted,
      tracks,
      activeBgmId: this.activeBgmId,
      pendingBgmId: this.pendingBgmId,
      activeSfxCount: this.activeSfx.size,
      anyPlaying,
      loadedBytes: this.loadedBytes(),
      estimatedRamBytes: this.estimatedRamBytes(),
      prepare: this.prepare,
      notice: this.notice,
    };
  }

  private emit(): void {
    if (this.disposed) return;
    this.snapshot = this.buildSnapshot();
    for (const l of [...this.listeners]) l();
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
