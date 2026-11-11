import { afterEach, describe, expect, it } from 'vitest';
import { cfg, flush, makeHarness, playingIds, status, type Harness } from './harness';

let current: Harness | null = null;
const setup = (...args: Parameters<typeof makeHarness>) => (current = makeHarness(...args));
afterEach(() => {
  current?.engine.dispose();
  current = null;
});
const track = (h: Harness, id: string) => h.engine.getSnapshot().tracks[id];

describe('Trim (cắt không phá hủy)', () => {
  it('không cắt: không dùng sprite, play() trần, thời lượng = cả file', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10 })]);
    await h.engine.toggle('a');
    const howl = h.howls.get('a')!;
    expect(howl.opts.sprite).toBeUndefined();
    expect(howl.lastPlayArg).toBeUndefined();
    expect(track(h, 'a')).toMatchObject({ durationSeconds: 10, windowStartSeconds: 0, fileDurationSeconds: 10 });
  });

  it('có cắt: dựng 1 sprite, luôn phát sprite đó; thời lượng/seek tính theo đoạn cắt', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 2, trimEnd: 6 })]);
    expect(track(h, 'a').durationSeconds).toBe(4); // hiển thị đúng ngay cả khi chưa nạp
    await h.engine.toggle('a');
    const howl = h.howls.get('a')!;
    expect(howl.opts.sprite).toEqual({ name: 'cue', startMs: 2000, lengthMs: 4000 });
    expect(howl.lastPlayArg).toBe('cue');
    expect(status(h, 'a')).toBe('playing');
    expect(track(h, 'a')).toMatchObject({ durationSeconds: 4, windowStartSeconds: 2, fileDurationSeconds: 10 });
    howl.position = 3.5; // vị trí tuyệt đối trong file gốc
    // @ts-expect-error gọi tick riêng để đọc vị trí
    h.engine.tick();
    expect(track(h, 'a').seekSeconds).toBe(1.5); // tương đối với đầu đoạn cắt
  });

  it('seek tính theo đoạn cắt và bị chặn trong đoạn', async () => {
    const h = setup([cfg('a', 'BGM', { durationSeconds: 10, trimStart: 2, trimEnd: 6 })]);
    await h.engine.toggle('a');
    const howl = h.howls.get('a')!;
    expect(h.engine.seek('a', 1)).toBe(true);
    expect(howl.position).toBe(3); // 2 + 1
    expect(h.engine.seek('a', 99)).toBe(true);
    expect(howl.position).toBe(6); // chặn ở cuối đoạn
    expect(h.engine.seek('a', -5)).toBe(true);
    expect(howl.position).toBe(2);
    expect(track(h, 'a').seekSeconds).toBe(0);
  });

  it('trimEnd = 0 nhưng trimStart > 0: phát từ trimStart đến hết file', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 3 })]);
    await h.engine.toggle('a');
    expect(h.howls.get('a')!.opts.sprite).toEqual({ name: 'cue', startMs: 3000, lengthMs: 7000 });
    expect(track(h, 'a').durationSeconds).toBe(7);
  });

  it('cấu hình cắt hỏng (đầu sau cuối) → rơi về phát cả file, không phát đoạn rỗng', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 9.95, trimEnd: 9.99 })]);
    await h.engine.toggle('a');
    expect(h.howls.get('a')!.opts.sprite).toBeUndefined();
    expect(track(h, 'a').durationSeconds).toBe(10);
  });

  it('phát lại / replay / stop rồi play đều quay về đầu đoạn cắt', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 2, trimEnd: 6 })]);
    await h.engine.toggle('a');
    const howl = h.howls.get('a')!;
    howl.position = 5;
    h.engine.stop('a');
    expect(howl.position).toBe(2);
    await h.engine.replay('a');
    expect(howl.lastPlayArg).toBe('cue');
    expect(status(h, 'a')).toBe('playing');
  });

  it('Pause rồi Resume dùng lại sound id (không phát lại từ đầu)', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 2, trimEnd: 6 })]);
    await h.engine.toggle('a');
    await h.engine.toggle('a'); // pause
    expect(status(h, 'a')).toBe('paused');
    await h.engine.toggle('a'); // resume
    expect(typeof h.howls.get('a')!.lastPlayArg).toBe('number');
    expect(status(h, 'a')).toBe('playing');
  });

  it('đổi điểm cắt khi cue đang rảnh: nhả howl cũ, lần phát kế dùng sprite mới', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 2, trimEnd: 6 })]);
    await h.engine.toggle('a');
    h.engine.stop('a');
    const first = h.howls.get('a')!;
    h.engine.syncSounds([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 1, trimEnd: 3 })]);
    expect(first.unloaded).toBe(true);
    expect(status(h, 'a')).toBe('idle');
    expect(track(h, 'a')).toMatchObject({ durationSeconds: 2, windowStartSeconds: 1 });
    await h.engine.toggle('a');
    const second = h.howls.get('a')!;
    expect(second).not.toBe(first);
    expect(second.opts.sprite).toEqual({ name: 'cue', startMs: 1000, lengthMs: 2000 });
    expect(status(h, 'a')).toBe('playing');
  });

  it('đổi điểm cắt khi đang phát: không ngắt, vùng hiển thị giữ nguyên cho tới khi dừng; phát lần sau dùng vùng mới', async () => {
    const h = setup([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 2, trimEnd: 6 })]);
    await h.engine.toggle('a');
    const first = h.howls.get('a')!;
    h.engine.syncSounds([cfg('a', 'SFX', { durationSeconds: 10, trimStart: 0, trimEnd: 3 })]);
    expect(first.unloaded).toBe(false);
    expect(status(h, 'a')).toBe('playing');
    expect(track(h, 'a')).toMatchObject({ durationSeconds: 4, windowStartSeconds: 2 }); // vẫn là vùng của howl đang phát
    h.engine.stop('a');
    await h.engine.toggle('a'); // phát lại => tạo howl mới
    const second = h.howls.get('a')!;
    expect(second).not.toBe(first);
    expect(first.unloaded).toBe(true);
    expect(second.opts.sprite).toEqual({ name: 'cue', startMs: 0, lengthMs: 3000 });
    expect(track(h, 'a')).toMatchObject({ durationSeconds: 3, windowStartSeconds: 0 });
  });

  it('chuyển BGM lỗi → khôi phục BGM cũ đã cắt ở đúng vị trí tương đối, không có 2 BGM', async () => {
    const h = setup([cfg('old', 'BGM', { durationSeconds: 20, trimStart: 5, trimEnd: 15 }), cfg('new', 'BGM')]);
    await h.engine.toggle('old');
    const oldHowl = h.howls.get('old')!;
    oldHowl.position = 9; // tương đối 4s
    // @ts-expect-error đọc vị trí
    h.engine.tick();
    h.failPlay('new');
    await h.engine.toggle('new');
    await flush();
    expect(playingIds(h)).toEqual(['old']);
    expect(oldHowl.position).toBe(9); // 5 + 4
    expect(oldHowl.lastPlayArg).toBe('cue');
  });

  it('STOP ALL dừng cả cue đã cắt', async () => {
    const h = setup([cfg('a', 'SFX', { trimStart: 1, trimEnd: 4 }), cfg('b', 'BGM')]);
    await h.engine.toggle('a');
    await h.engine.toggle('b');
    h.engine.stopAll();
    expect(playingIds(h)).toEqual([]);
  });
});

describe('Tốc độ playback', () => {
  it('mặc định 1×; tạo howl với rate của cue', async () => {
    const h = setup([cfg('a', 'SFX', { playbackRate: 1.5 })]);
    expect(track(h, 'a').rate).toBe(1.5);
    await h.engine.toggle('a');
    expect(h.howls.get('a')!.opts.rate).toBe(1.5);
    expect(h.howls.get('a')!.rateValue).toBe(1.5);
  });

  it('setRate áp dụng ngay (cả khi đang phát), bị chặn trong 0.5–2, giá trị rác → 1', async () => {
    const h = setup([cfg('a', 'SFX')]);
    await h.engine.toggle('a');
    const howl = h.howls.get('a')!;
    h.engine.setRate('a', 1.25);
    expect(howl.rateValue).toBe(1.25);
    expect(track(h, 'a').rate).toBe(1.25);
    expect(status(h, 'a')).toBe('playing');
    h.engine.setRate('a', 9);
    expect(track(h, 'a').rate).toBe(2);
    h.engine.setRate('a', 0.1);
    expect(track(h, 'a').rate).toBe(0.5);
    h.engine.setRate('a', Number.NaN);
    expect(track(h, 'a').rate).toBe(1);
  });

  it('đổi tốc độ khi chưa nạp: nhớ lại và áp dụng khi nạp', async () => {
    const h = setup([cfg('a', 'SFX')]);
    h.engine.setRate('a', 0.75);
    await h.engine.toggle('a');
    expect(h.howls.get('a')!.opts.rate).toBe(0.75);
  });

  it('tốc độ chỉnh tay tạm thời không bị metadata ghi đè; chưa chỉnh thì theo metadata mới', async () => {
    const h = setup([cfg('a', 'SFX', { playbackRate: 1 }), cfg('b', 'SFX', { playbackRate: 1 })]);
    h.engine.setRate('a', 1.5);
    h.engine.syncSounds([cfg('a', 'SFX', { playbackRate: 0.75 }), cfg('b', 'SFX', { playbackRate: 0.75 })]);
    expect(track(h, 'a').rate).toBe(1.5);
    expect(track(h, 'b').rate).toBe(0.75);
  });

  it('beginPlayback luôn đặt lại rate (replay giữ tốc độ đang chọn)', async () => {
    const h = setup([cfg('a', 'SFX')]);
    await h.engine.toggle('a');
    h.engine.setRate('a', 1.5);
    await h.engine.replay('a');
    expect(h.howls.get('a')!.rateValue).toBe(1.5);
  });
});
