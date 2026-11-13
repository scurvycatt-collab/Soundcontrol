import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg, makeHarness, type Harness } from './harness';

let current: Harness | null = null;
const setup = (...args: Parameters<typeof makeHarness>) => (current = makeHarness(...args));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  current?.engine.dispose();
  current = null;
  vi.useRealTimers();
});
const play = async (h: Harness, id: string) => {
  const p = h.engine.toggle(id);
  await vi.advanceTimersByTimeAsync(5);
  await p;
};
const at = (h: Harness, id: string, pos: number) => (h.howls.get(id)!.position = pos);
const step = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('Fade in / fade out', () => {
  it('fade in: bắt đầu từ 0 (không giật), tăng theo vị trí, đạt 100% rồi tắt vòng fx', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, fadeIn: 2 })]);
    const baseline = vi.getTimerCount();
    await play(h, 'a');
    const howl = h.howls.get('a')!;
    expect(howl.vol).toBe(0);
    at(h, 'a', 1);
    await step(100);
    expect(howl.vol).toBeCloseTo(0.5, 1);
    at(h, 'a', 2.5);
    await step(100);
    expect(howl.vol).toBe(1);
    await step(2000); // chờ các timeout tạm của lệnh play hết hạn
    expect(vi.getTimerCount()).toBe(baseline); // vòng fx đã tự tắt
  });

  it('fade out: giảm về 0 ở cuối đoạn', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, fadeOut: 2 })]);
    await play(h, 'a');
    const howl = h.howls.get('a')!;
    at(h, 'a', 5);
    await step(100);
    expect(howl.vol).toBe(1);
    at(h, 'a', 9);
    await step(10_000); // nhịp tick của engine (200ms ngoài đời thật) đánh thức vòng fx khi gần cuối
    expect(howl.vol).toBeCloseTo(0.5, 1);
    at(h, 'a', 9.9);
    await step(100);
    expect(howl.vol).toBeLessThan(0.1);
  });

  it('theo thời gian thực: tốc độ ×2 thì fade in 2s thực = 4s media', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, fadeIn: 2, playbackRate: 2 })]);
    await play(h, 'a');
    at(h, 'a', 2); // 1s thực → mới được nửa đường
    await step(100);
    expect(h.howls.get('a')!.vol).toBeCloseTo(0.5, 1);
    at(h, 'a', 4);
    await step(100);
    expect(h.howls.get('a')!.vol).toBe(1);
  });

  it('tôn trọng âm lượng người dùng và đoạn cắt', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 2, trimEnd: 6, fadeIn: 1, defaultVolume: 0.8 })]);
    await play(h, 'a');
    const howl = h.howls.get('a')!;
    at(h, 'a', 2.5); // 0.5s trong đoạn cắt
    await step(100);
    expect(howl.vol).toBeCloseTo(0.4, 1);
  });

  it('Loop bật: không fade out, fade in chỉ ở vòng đầu', async () => {
    const h = setup([cfg('a', 'BGM', { durationSeconds: 10, fadeIn: 2, fadeOut: 2, loopDefault: true })]);
    await play(h, 'a');
    const howl = h.howls.get('a')!;
    at(h, 'a', 9.5);
    await step(100);
    expect(howl.vol).toBe(1); // không fade out khi lặp
    howl.finish(); // sang vòng 2
    at(h, 'a', 0);
    await step(100);
    expect(howl.vol).toBe(1); // không fade in lại
  });

  it('không có fade: không bật vòng 40ms và âm lượng nguyên vẹn', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10 })]);
    const baseline = vi.getTimerCount();
    await play(h, 'a');
    expect(h.howls.get('a')!.vol).toBe(1);
    await step(2000);
    expect(vi.getTimerCount()).toBe(baseline);
  });
});

describe('Ducking BGM khi SFX phát', () => {
  it('SFX phát → BGM hạ xuống level; SFX hết → trả về 100% sau khoảng giữ', async () => {
    const h = setup([cfg('bgm', 'BGM', { durationSeconds: 60 }), cfg('s', 'SFX', { durationSeconds: 3 })]);
    const baseline = vi.getTimerCount();
    await play(h, 'bgm');
    const bgm = h.howls.get('bgm')!;
    expect(bgm.vol).toBe(1);
    await play(h, 's');
    await step(300);
    expect(bgm.vol).toBeCloseTo(0.35, 2);
    expect(h.howls.get('s')!.vol).toBe(1); // SFX không bị giảm
    h.howls.get('s')!.finish();
    await step(300);
    expect(bgm.vol).toBeCloseTo(0.35, 2); // còn trong thời gian giữ
    await step(1500);
    expect(bgm.vol).toBe(1);
    expect(vi.getTimerCount()).toBe(baseline); // vòng fx đã tự tắt
  });

  it('hai SFX liên tiếp: BGM không "bơm" lên giữa chừng', async () => {
    const h = setup([cfg('bgm', 'BGM'), cfg('s1', 'SFX', { durationSeconds: 1 }), cfg('s2', 'SFX', { durationSeconds: 1 })]);
    await play(h, 'bgm');
    await play(h, 's1');
    await step(300);
    h.howls.get('s1')!.finish();
    await step(200);
    await play(h, 's2');
    await step(300);
    expect(h.howls.get('bgm')!.vol).toBeCloseTo(0.35, 2);
  });

  it('tắt ducking: BGM giữ nguyên; bật lại giữa chừng thì áp dụng ngay', async () => {
    const h = setup([cfg('bgm', 'BGM'), cfg('s', 'SFX', { durationSeconds: 5 })]);
    h.engine.setDuck({ enabled: false });
    await play(h, 'bgm');
    await play(h, 's');
    await step(400);
    expect(h.howls.get('bgm')!.vol).toBe(1);
    h.engine.setDuck({ enabled: true, level: 0.2 });
    expect(h.howls.get('bgm')!.vol).toBeCloseTo(0.2, 2);
    expect(h.engine.getSnapshot().duck).toEqual({ enabled: true, level: 0.2 });
  });

  it('nhân với âm lượng BGM do người dùng đặt', async () => {
    const h = setup([cfg('bgm', 'BGM', { defaultVolume: 0.6 }), cfg('s', 'SFX', { durationSeconds: 5 })]);
    await play(h, 'bgm');
    await play(h, 's');
    await step(300);
    expect(h.howls.get('bgm')!.vol).toBeCloseTo(0.6 * 0.35, 2);
  });

  it('STOP ALL: BGM tắt, lần phát sau không bị kẹt ở mức đã hạ', async () => {
    const h = setup([cfg('bgm', 'BGM'), cfg('s', 'SFX', { durationSeconds: 5 })]);
    await play(h, 'bgm');
    await play(h, 's');
    await step(300);
    h.engine.stopAll();
    await step(2000);
    await play(h, 'bgm');
    await step(100);
    expect(h.howls.get('bgm')!.vol).toBe(1);
  });
});
