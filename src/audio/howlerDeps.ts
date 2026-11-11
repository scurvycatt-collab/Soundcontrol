import { Howl, Howler } from 'howler';
import type { EngineDeps, HowlFactoryOptions, HowlLike } from './types';

interface HowlerInternals {
  ctx?: AudioContext | null;
  masterGain?: GainNode | null;
  usingWebAudio?: boolean;
  autoSuspend?: boolean;
  state?: string;
  _autoResume?: () => void;
}

const internals = (): HowlerInternals => Howler as unknown as HowlerInternals;

interface HowlInternal {
  _rate: number;
  _sounds: { _id: number; _sprite: string }[];
  _sprite: Record<string, unknown>;
  rate(r: number, id?: number): unknown;
}

/**
 * Howler 2.2: howl.rate(r) KHÔNG id sẽ ném lỗi khi howl dùng sprite tùy chỉnh và có sound chưa từng phát
 * (sound đó mang tên sprite '__default' không tồn tại). Ta tự đặt rate cho các lần phát sau (`_rate`) và chỉ
 * áp dụng ngay cho các sound đã gắn đúng sprite.
 */
function wrapHowl(howl: Howl): HowlLike {
  const h = howl as unknown as HowlInternal;
  const wrapped = howl as unknown as HowlLike;
  const original = h.rate.bind(howl); // phải giữ bản gốc: wrapper ghi đè chính howl.rate
  wrapped.rate = (r: number) => {
    h._rate = r;
    for (const snd of h._sounds) {
      if (snd._sprite in h._sprite) original(r, snd._id);
    }
    return wrapped;
  };
  return wrapped;
}

/** Cầu nối engine ↔ howler.js (Web Audio API ưu tiên, html5: false). */
export function createHowlerDeps(): EngineDeps {
  // Không tự suspend AudioContext khi rảnh: tránh độ trễ resume ngay lúc cue được bấm.
  internals().autoSuspend = false;

  return {
    createHowl(o: HowlFactoryOptions): HowlLike {
      const howl = new Howl({
        src: [o.src],
        format: [o.format], // blob URL không có đuôi tệp nên phải khai báo định dạng
        html5: false,
        preload: true,
        volume: o.volume,
        loop: o.loop,
        rate: o.rate,
        ...(o.sprite ? { sprite: { [o.sprite.name]: [o.sprite.startMs, o.sprite.lengthMs, false] as [number, number, boolean] } } : {}),
        onload: () => o.onload(),
        onloaderror: (id, err) => o.onloaderror(id, err),
        onplay: (id) => o.onplay(id),
        onpause: (id) => o.onpause(id),
        onstop: (id) => o.onstop(id),
        onend: (id) => o.onend(id),
        onplayerror: (id, err) => o.onplayerror(id, err),
      });
      return wrapHowl(howl);
    },

    async unlockContext(): Promise<boolean> {
      const ctx = internals().ctx;
      if (!ctx) return !internals().usingWebAudio; // fallback HTML5 Audio: không cần unlock
      if (ctx.state !== 'running') await ctx.resume();
      if (ctx.state === 'running') {
        // Howler giữ cờ trạng thái riêng; nếu còn 'suspended' nó sẽ xếp hàng lệnh play thay vì phát ngay.
        const g = internals();
        g.state = 'running';
        g._autoResume?.();
      }
      return ctx.state === 'running';
    },

    getContextState(): string {
      const ctx = internals().ctx;
      return ctx ? ctx.state : 'running';
    },

    setMasterVolume(v: number): void {
      Howler.volume(v); // cũng khởi tạo AudioContext của Howler nếu chưa có
    },

    setMasterMute(m: boolean): void {
      Howler.mute(m);
    },

    playTestTone(): void {
      const ctx = internals().ctx;
      const master = internals().masterGain;
      if (!ctx || !master) throw new Error('AudioContext chưa sẵn sàng');
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.03); // mức nhỏ, an toàn cho loa
      gain.gain.linearRampToValueAtTime(0, t + 0.7);
      osc.connect(gain);
      gain.connect(master); // đi qua master volume/mute như các cue khác
      osc.start(t);
      osc.stop(t + 0.75);
    },

    createObjectURL: (b: Blob) => URL.createObjectURL(b),
    revokeObjectURL: (u: string) => URL.revokeObjectURL(u),
  };
}
