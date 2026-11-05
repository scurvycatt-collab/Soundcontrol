import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg, flush, makeHarness, playingIds, status, type Harness } from './harness';

let current: Harness | null = null;
const setup = (...args: Parameters<typeof makeHarness>) => (current = makeHarness(...args));
afterEach(() => {
  current?.engine.dispose();
  current = null;
});

const bgms = (n: number) => Array.from({ length: n }, (_, i) => cfg(`bgm${i + 1}`, 'BGM'));
const sfxs = (n: number) => Array.from({ length: n }, (_, i) => cfg(`sfx${i + 1}`, 'SFX'));

describe('A01/A02 — unlock & autoplay policy', () => {
  it('không tự phát khi chưa unlock; hiện cảnh báo', async () => {
    const h = setup([cfg('a', 'BGM')], {}, { unlocked: false });
    expect(h.engine.getSnapshot().engineState).toBe('locked');
    await h.engine.toggle('a');
    expect(h.createdHowls).toHaveLength(0);
    expect(status(h, 'a')).toBe('idle');
    expect(h.engine.getSnapshot().notice?.message).toMatch(/Kích hoạt âm thanh/);
  });

  it('unlock rồi mới phát; không tự phát lại lệnh cũ sau unlock', async () => {
    const h = setup([cfg('a', 'BGM')], {}, { unlocked: false });
    await h.engine.toggle('a'); // bị chặn
    await h.engine.unlock();
    await flush();
    expect(h.engine.getSnapshot().engineState).toBe('ready');
    expect(playingIds(h)).toEqual([]); // không tự phát bất ngờ
    await h.engine.toggle('a');
    expect(playingIds(h)).toEqual(['a']);
  });

  it('Test Sound chỉ chạy khi đã unlock', () => {
    const h = setup([], {}, { unlocked: false });
    expect(h.engine.testSound()).toBe(false);
    expect(h.testTones).toBe(0);
  });

  it('Test Sound phát tone sau khi unlock', async () => {
    const h = setup([], {}, { unlocked: false });
    await h.engine.unlock();
    expect(h.engine.testSound()).toBe(true);
    expect(h.testTones).toBe(1);
  });
});

describe('A03/A04 — BGM exclusivity & switching', () => {
  it('A03: bấm BGM B khi A đang phát → A dừng, chỉ B phát', async () => {
    const h = setup(bgms(2));
    await h.engine.toggle('bgm1');
    expect(playingIds(h)).toEqual(['bgm1']);
    await h.engine.toggle('bgm2');
    expect(playingIds(h)).toEqual(['bgm2']);
    expect(status(h, 'bgm1')).toBe('ready');
    expect(h.engine.getSnapshot().activeBgmId).toBe('bgm2');
  });

  it('A03: A giữ nguyên phát trong lúc B đang tải, rồi mới chuyển', async () => {
    const h = setup(bgms(2));
    await h.engine.toggle('bgm1');
    const gate = h.hold('bgm2');
    const p = h.engine.toggle('bgm2');
    await flush();
    expect(status(h, 'bgm1')).toBe('playing');
    expect(status(h, 'bgm2')).toBe('loading');
    expect(h.engine.getSnapshot().pendingBgmId).toBe('bgm2');
    gate.resolve();
    await p;
    expect(playingIds(h)).toEqual(['bgm2']);
    expect(h.engine.getSnapshot().pendingBgmId).toBeNull();
  });

  it('A04: B load lỗi khi A đang phát → A vẫn phát, B báo lỗi', async () => {
    const h = setup(bgms(2));
    await h.engine.toggle('bgm1');
    h.failFetch('bgm2', 'Không có quyền đọc file');
    await h.engine.toggle('bgm2');
    expect(status(h, 'bgm1')).toBe('playing');
    expect(status(h, 'bgm2')).toBe('error');
    expect(h.engine.getSnapshot().tracks.bgm2.errorMessage).toMatch(/quyền/);
    expect(h.engine.getSnapshot().activeBgmId).toBe('bgm1');
    expect(h.engine.getSnapshot().notice?.level).toBe('error');
  });

  it('A04: lỗi giải mã → error, BGM cũ không bị ảnh hưởng', async () => {
    const h = setup(bgms(2));
    await h.engine.toggle('bgm1');
    h.failDecode('bgm2');
    await h.engine.toggle('bgm2');
    expect(status(h, 'bgm2')).toBe('error');
    expect(h.engine.getSnapshot().tracks.bgm2.errorMessage).toMatch(/giải mã/);
    expect(status(h, 'bgm1')).toBe('playing');
    expect(h.revoked.some((u) => u.startsWith('blob:bgm2'))).toBe(true); // không rò rỉ blob URL
  });

  it('B play lỗi sau khi bắt đầu chuyển → khôi phục BGM cũ, không có 2 BGM', async () => {
    const h = setup(bgms(2));
    await h.engine.toggle('bgm1');
    h.howls.get('bgm1')!.position = 12.5;
    h.failPlay('bgm2');
    await h.engine.toggle('bgm2');
    expect(status(h, 'bgm2')).toBe('error');
    expect(playingIds(h)).toEqual(['bgm1']);
    expect(h.howls.get('bgm1')!.position).toBeCloseTo(12.5);
    expect(h.engine.getSnapshot().activeBgmId).toBe('bgm1');
  });

  it('bấm nhiều BGM liên tục: chỉ yêu cầu mới nhất có hiệu lực', async () => {
    const h = setup(bgms(3));
    const g1 = h.hold('bgm1');
    const g2 = h.hold('bgm2');
    const g3 = h.hold('bgm3');
    const p1 = h.engine.toggle('bgm1');
    const p2 = h.engine.toggle('bgm2');
    const p3 = h.engine.toggle('bgm3');
    g3.resolve();
    await p3;
    g1.resolve();
    g2.resolve();
    await Promise.all([p1, p2]);
    expect(playingIds(h)).toEqual(['bgm3']);
    expect(status(h, 'bgm1')).toBe('ready');
    expect(status(h, 'bgm2')).toBe('ready');
  });

  it('Pause BGM rồi Play lại → resume cùng vị trí (không về 0)', async () => {
    const h = setup(bgms(1));
    await h.engine.toggle('bgm1');
    h.howls.get('bgm1')!.position = 20;
    h.engine.toggle('bgm1'); // pause
    expect(status(h, 'bgm1')).toBe('paused');
    expect(h.engine.getSnapshot().tracks.bgm1.seekSeconds).toBe(20);
    h.engine.toggle('bgm1'); // resume
    expect(status(h, 'bgm1')).toBe('playing');
    expect(h.howls.get('bgm1')!.position).toBe(20);
  });

  it('BGM A tạm dừng, bấm BGM B → A bị dừng hẳn (không còn "active")', async () => {
    const h = setup(bgms(2));
    await h.engine.toggle('bgm1');
    h.engine.toggle('bgm1'); // pause
    await h.engine.toggle('bgm2');
    expect(playingIds(h)).toEqual(['bgm2']);
    expect(status(h, 'bgm1')).toBe('ready');
  });
});

describe('A05 — STOP ALL thắng mọi lệnh đang chờ', () => {
  it('A → B → STOP ALL cực nhanh: không track nào tự phát sau Stop All', async () => {
    const h = setup(bgms(2));
    const gA = h.hold('bgm1');
    const gB = h.hold('bgm2');
    const pA = h.engine.toggle('bgm1');
    const pB = h.engine.toggle('bgm2');
    h.engine.stopAll();
    gB.resolve();
    gA.resolve();
    await Promise.all([pA, pB]);
    await flush();
    expect(playingIds(h)).toEqual([]);
    expect(status(h, 'bgm1')).toBe('ready'); // tải xong muộn chỉ đánh dấu ready
    expect(status(h, 'bgm2')).toBe('ready');
    expect(h.engine.getSnapshot().pendingBgmId).toBeNull();
  });

  it('STOP ALL dừng BGM + mọi SFX và reset progress về 0', async () => {
    const h = setup([...bgms(1), ...sfxs(3)]);
    await h.engine.toggle('bgm1');
    for (const id of ['sfx1', 'sfx2', 'sfx3']) await h.engine.toggle(id);
    h.howls.get('bgm1')!.position = 33;
    h.engine.stopAll();
    expect(playingIds(h)).toEqual([]);
    for (const id of ['bgm1', 'sfx1', 'sfx2', 'sfx3']) {
      expect(status(h, id)).toBe('ready');
      expect(h.engine.getSnapshot().tracks[id].seekSeconds).toBe(0);
    }
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
    expect(h.engine.getSnapshot().activeBgmId).toBeNull();
  });

  it('STOP ALL luôn khả dụng kể cả khi chưa unlock hoặc không có cue', () => {
    const h = setup([cfg('a', 'BGM')], {}, { unlocked: false });
    expect(() => h.engine.stopAll()).not.toThrow();
  });

  it('SFX đang chờ tải + STOP ALL → không tự phát', async () => {
    const h = setup(sfxs(1));
    const g = h.hold('sfx1');
    const p = h.engine.toggle('sfx1');
    h.engine.stopAll();
    g.resolve();
    await p;
    expect(playingIds(h)).toEqual([]);
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
  });

  it('Stop từng track khi đang chờ tải cũng huỷ lệnh play', async () => {
    const h = setup(sfxs(1));
    const g = h.hold('sfx1');
    const p = h.engine.toggle('sfx1');
    h.engine.stop('sfx1');
    g.resolve();
    await p;
    expect(playingIds(h)).toEqual([]);
    expect(status(h, 'sfx1')).toBe('ready');
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
  });
});

describe('A06/A07/A08 — SFX', () => {
  it('A06: BGM + 5 SFX cùng phát; pause một SFX không ảnh hưởng các cue khác', async () => {
    const h = setup([...bgms(1), ...sfxs(5)]);
    await h.engine.toggle('bgm1');
    for (let i = 1; i <= 5; i++) await h.engine.toggle(`sfx${i}`);
    expect(playingIds(h)).toHaveLength(6);
    h.engine.toggle('sfx3'); // pause
    expect(status(h, 'sfx3')).toBe('paused');
    expect(playingIds(h)).toEqual(['bgm1', 'sfx1', 'sfx2', 'sfx4', 'sfx5']);
    expect(h.engine.getSnapshot().activeSfxCount).toBe(4);
  });

  it('SFX không dừng BGM đang phát', async () => {
    const h = setup([...bgms(1), ...sfxs(1)]);
    await h.engine.toggle('bgm1');
    await h.engine.toggle('sfx1');
    h.engine.stop('sfx1');
    expect(status(h, 'bgm1')).toBe('playing');
  });

  it('A07: Replay liên tục / double-click chỉ có 1 instance (luôn stop trước khi play)', async () => {
    const h = setup(sfxs(1));
    await h.engine.toggle('sfx1');
    const howl = h.howls.get('sfx1')!;
    howl.position = 3;
    const stopsBefore = howl.stopCalls;
    for (let i = 0; i < 5; i++) await h.engine.replay('sfx1');
    expect(h.createdHowls).toHaveLength(1); // không tạo Howl mới
    expect(howl.stopCalls).toBeGreaterThan(stopsBefore);
    expect(howl.position).toBe(0);
    expect(playingIds(h)).toEqual(['sfx1']);
    expect(h.engine.getSnapshot().activeSfxCount).toBe(1);
  });

  it('A07: replay khi đang tải không sinh thêm lệnh phát', async () => {
    const h = setup(sfxs(1));
    const g = h.hold('sfx1');
    const p1 = h.engine.toggle('sfx1');
    const p2 = h.engine.replay('sfx1');
    const p3 = h.engine.replay('sfx1');
    g.resolve();
    await Promise.all([p1, p2, p3]);
    expect(h.createdHowls).toHaveLength(1);
    expect(h.howls.get('sfx1')!.playCalls).toBe(1);
    expect(h.engine.getSnapshot().activeSfxCount).toBe(1);
  });

  it('A08: vượt MAX_ACTIVE_SFX → từ chối, báo rõ, không dừng sound đang phát', async () => {
    const h = setup(sfxs(18), { maxActiveSfx: 16 });
    for (let i = 1; i <= 16; i++) await h.engine.toggle(`sfx${i}`);
    expect(playingIds(h)).toHaveLength(16);
    expect(await h.engine.toggle('sfx17')).toBe(false);
    expect(h.engine.getSnapshot().notice?.message).toBe('Đã đạt giới hạn SFX đồng thời');
    expect(status(h, 'sfx17')).toBe('idle');
    expect(playingIds(h)).toHaveLength(16);
    // giải phóng một slot rồi phát được
    h.engine.stop('sfx1');
    expect(await h.engine.toggle('sfx17')).toBe(true);
    expect(playingIds(h)).toHaveLength(16);
  });

  it('A08: đếm SFX không lệch sau end / pause / stop / lỗi', async () => {
    const h = setup(sfxs(4));
    for (const id of ['sfx1', 'sfx2', 'sfx3']) await h.engine.toggle(id);
    h.howls.get('sfx1')!.finish();
    h.engine.toggle('sfx2'); // pause
    h.engine.stop('sfx3');
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
    h.failFetch('sfx4');
    await h.engine.toggle('sfx4');
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
    h.engine.toggle('sfx2'); // resume
    expect(h.engine.getSnapshot().activeSfxCount).toBe(1);
  });
});

describe('A09/A10/A11 — pause/stop/seek/end/loop', () => {
  it('A09: Pause → Play resume đúng seek; Stop → Play phát từ 0', async () => {
    const h = setup(sfxs(1));
    await h.engine.toggle('sfx1');
    const howl = h.howls.get('sfx1')!;
    howl.position = 7.25;
    h.engine.toggle('sfx1');
    expect(h.engine.getSnapshot().tracks.sfx1.seekSeconds).toBe(7.25);
    h.engine.toggle('sfx1');
    expect(howl.position).toBe(7.25);
    h.engine.stop('sfx1');
    expect(status(h, 'sfx1')).toBe('ready');
    expect(h.engine.getSnapshot().tracks.sfx1.seekSeconds).toBe(0);
    await h.engine.toggle('sfx1');
    expect(howl.position).toBe(0);
    expect(status(h, 'sfx1')).toBe('playing');
  });

  it('A10: seek 25%, 100%, giá trị lỗi', async () => {
    const h = setup([cfg('a', 'BGM', { durationSeconds: 100 })]);
    await h.engine.toggle('a');
    const howl = h.howls.get('a')!;
    expect(h.engine.seek('a', 25)).toBe(true);
    expect(howl.position).toBe(25);
    expect(h.engine.seek('a', 100)).toBe(true);
    expect(howl.position).toBe(100);
    expect(h.engine.seek('a', 9999)).toBe(true); // clamp
    expect(howl.position).toBe(100);
    expect(h.engine.seek('a', -5)).toBe(true);
    expect(howl.position).toBe(0);
    expect(h.engine.seek('a', NaN)).toBe(false);
    expect(h.engine.seek('a', Infinity)).toBe(false);
  });

  it('A10: không seek khi chưa load hoặc duration không hợp lệ', async () => {
    const h = setup([cfg('a', 'BGM', { durationSeconds: 0 })]);
    expect(h.engine.seek('a', 5)).toBe(false); // chưa load
    await h.engine.toggle('a'); // howl báo duration = 0
    expect(status(h, 'a')).toBe('playing');
    expect(h.engine.seek('a', 5)).toBe(false); // duration không hợp lệ → không seek
    expect(h.howls.get('a')!.position).toBe(0);
    expect(h.engine.seek('zzz', 1)).toBe(false); // id không tồn tại
  });

  it('A10: không seek được khi track đang idle/ready (không phát)', async () => {
    const h = setup(sfxs(1));
    await h.engine.prepareShow(['sfx1']);
    expect(h.engine.seek('sfx1', 5)).toBe(false);
  });

  it('A11: kết thúc tự nhiên → ended, counter đúng', async () => {
    const h = setup([...bgms(1), ...sfxs(1)]);
    await h.engine.toggle('sfx1');
    await h.engine.toggle('bgm1');
    h.howls.get('sfx1')!.finish();
    expect(status(h, 'sfx1')).toBe('ended');
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
    h.howls.get('bgm1')!.finish();
    expect(status(h, 'bgm1')).toBe('ended');
    expect(h.engine.getSnapshot().activeBgmId).toBeNull();
    expect(h.engine.getSnapshot().anyPlaying).toBe(false);
    // ended → play lại từ 0
    await h.engine.toggle('sfx1');
    expect(status(h, 'sfx1')).toBe('playing');
  });

  it('A11: loop on → hết bài vẫn playing; loop off → ended', async () => {
    const h = setup([cfg('a', 'BGM', { loopDefault: true })]);
    await h.engine.toggle('a');
    h.howls.get('a')!.finish();
    expect(status(h, 'a')).toBe('playing');
    h.engine.setLoop('a', false);
    expect(h.howls.get('a')!.looping).toBe(false);
    h.howls.get('a')!.finish();
    expect(status(h, 'a')).toBe('ended');
  });

  it('loop mặc định tắt', async () => {
    const h = setup([cfg('a', 'SFX')]);
    expect(h.engine.getSnapshot().tracks.a.loop).toBe(false);
  });
});

describe('A12 — master vs track volume', () => {
  it('master và volume từng track độc lập, không nhân tích luỹ', async () => {
    const h = setup([cfg('a', 'BGM', { defaultVolume: 0.8 })]);
    await h.engine.toggle('a');
    h.engine.setTrackVolume('a', 0.5);
    for (const v of [0.2, 0.9, 0.4]) h.engine.setMasterVolume(v);
    expect(h.master.volume).toBe(0.4);
    expect(h.howls.get('a')!.vol).toBe(0.5); // howl volume KHÔNG bị nhân với master
    expect(h.engine.getSnapshot().tracks.a.volume).toBe(0.5);
    h.engine.setMasterVolume(1);
    expect(h.howls.get('a')!.vol).toBe(0.5);
  });

  it('volume mặc định master 70% và clamp 0..1', () => {
    const h = setup([cfg('a', 'BGM')]);
    expect(h.engine.getSnapshot().masterVolume).toBe(0.7);
    h.engine.setMasterVolume(5);
    expect(h.engine.getSnapshot().masterVolume).toBe(1);
    h.engine.setMasterVolume(-1);
    expect(h.engine.getSnapshot().masterVolume).toBe(0);
    h.engine.setTrackVolume('a', 9);
    expect(h.engine.getSnapshot().tracks.a.volume).toBe(1);
  });

  it('mute độc lập với master volume', () => {
    const h = setup([]);
    h.engine.setMasterVolume(0.6);
    h.engine.setMasterMute(true);
    expect(h.master.muted).toBe(true);
    expect(h.master.volume).toBe(0.6);
    h.engine.setMasterMute(false);
    expect(h.master.muted).toBe(false);
    expect(h.master.volume).toBe(0.6);
  });
});

describe('A13/A14 — đồng bộ metadata & vòng đời', () => {
  it('A13: đổi tên/cảnh/thứ tự (syncSounds) không tạo lại Howl, không dừng nhạc đang phát', async () => {
    const h = setup([...bgms(1), ...sfxs(1)]);
    await h.engine.toggle('bgm1');
    await h.engine.toggle('sfx1');
    const stopsBefore = h.howls.get('bgm1')!.stopCalls;
    for (let i = 0; i < 5; i++) {
      h.engine.syncSounds([
        cfg('bgm1', 'BGM', { defaultVolume: 0.3 }),
        cfg('sfx1', 'SFX', { loopDefault: true }),
      ]);
    }
    expect(h.createdHowls).toHaveLength(2);
    expect(h.howls.get('bgm1')!.stopCalls).toBe(stopsBefore);
    expect(playingIds(h)).toEqual(['bgm1', 'sfx1']);
    // volume/loop đang phát không bị ghi đè bởi default mới
    expect(h.howls.get('bgm1')!.vol).toBe(1);
    expect(h.howls.get('sfx1')!.looping).toBe(false);
  });

  it('A13: default mới được áp dụng cho track không phát và chưa chỉnh tay', () => {
    const h = setup([cfg('a', 'SFX', { defaultVolume: 1 })]);
    h.engine.syncSounds([cfg('a', 'SFX', { defaultVolume: 0.4 })]);
    expect(h.engine.getSnapshot().tracks.a.volume).toBe(0.4);
    h.engine.setTrackVolume('a', 0.9);
    h.engine.syncSounds([cfg('a', 'SFX', { defaultVolume: 0.1 })]);
    expect(h.engine.getSnapshot().tracks.a.volume).toBe(0.9);
  });

  it('A13: cue bị xóa khỏi danh sách → dừng, unload, thu hồi blob URL', async () => {
    const h = setup([...bgms(1), ...sfxs(1)]);
    await h.engine.toggle('bgm1');
    await h.engine.toggle('sfx1');
    h.engine.syncSounds([cfg('bgm1', 'BGM')]);
    expect(h.howls.get('sfx1')!.unloaded).toBe(true);
    expect(h.revoked.some((u) => u.startsWith('blob:sfx1'))).toBe(true);
    expect(h.engine.getSnapshot().tracks.sfx1).toBeUndefined();
    expect(playingIds(h)).toEqual(['bgm1']);
  });

  it('đổi category của cue đang phát → dừng cue đó và báo', async () => {
    const h = setup([cfg('a', 'SFX')]);
    await h.engine.toggle('a');
    h.engine.syncSounds([cfg('a', 'BGM')]);
    expect(status(h, 'a')).toBe('ready');
    expect(h.engine.getSnapshot().notice?.message).toMatch(/dừng/);
  });

  it('A14: dispose dọn sạch Howl + blob URL + listener (StrictMode mount/unmount)', async () => {
    const h = setup([...bgms(2), ...sfxs(2)]);
    await h.engine.prepareShow(['bgm1', 'bgm2', 'sfx1', 'sfx2']);
    expect(h.engine.debugCounts().howls).toBe(4);
    const listener = vi.fn();
    h.engine.subscribe(listener);
    h.engine.dispose();
    expect(h.createdHowls.every((x) => x.unloaded)).toBe(true);
    expect(h.revoked).toHaveLength(h.createdUrls.length);
    expect(h.engine.debugCounts()).toEqual({ entries: 0, howls: 0, blobUrls: 0, activeSfx: 0 });
    h.engine.setMasterVolume(0.1); // sau dispose: im lặng, không ném lỗi
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe/unsubscribe: nhiều lần mount không tích luỹ listener', async () => {
    const h = setup([cfg('a', 'SFX')]);
    const fn = vi.fn();
    const unsubs = Array.from({ length: 5 }, () => h.engine.subscribe(fn));
    unsubs.forEach((u) => u());
    await h.engine.toggle('a');
    expect(fn).not.toHaveBeenCalled();
  });

  it('snapshot giữ nguyên tham chiếu cho track không đổi (React.memo hiệu quả)', async () => {
    const h = setup(sfxs(2));
    const before = h.engine.getSnapshot().tracks.sfx2;
    await h.engine.toggle('sfx1');
    expect(h.engine.getSnapshot().tracks.sfx2).toBe(before);
  });
});

describe('A22/A24 — preload, offline, lỗi', () => {
  it('Prepare Show tải + giải mã, báo Ready/Failed', async () => {
    const h = setup([...bgms(1), ...sfxs(3)]);
    h.failFetch('sfx2');
    const r = await h.engine.prepareShow(['bgm1', 'sfx1', 'sfx2', 'sfx3']);
    expect(r.requested).toBe(4);
    expect(r.ready).toBe(3);
    expect(r.failed).toEqual(['sfx2']);
    expect(status(h, 'sfx2')).toBe('error');
    expect(status(h, 'sfx1')).toBe('ready');
    expect(h.engine.getSnapshot().prepare).toMatchObject({ running: false, total: 4, done: 4, failed: 1 });
    expect(h.fetchCalls.sort()).toEqual(['bgm1', 'sfx1', 'sfx2', 'sfx3']);
  });

  it('A22: sau khi preload, cue đã tải vẫn phát được khi mất mạng; cue chưa tải thì lỗi, không giả vờ phát', async () => {
    const h = setup(sfxs(2));
    await h.engine.prepareShow(['sfx1']);
    h.failFetch('sfx2', 'Không tải được file: lỗi mạng'); // mạng đã mất
    h.failFetch('sfx1', 'Không tải được file: lỗi mạng');
    const fetchesBefore = h.fetchCalls.length;
    await h.engine.toggle('sfx1');
    expect(status(h, 'sfx1')).toBe('playing');
    expect(h.fetchCalls.length).toBe(fetchesBefore); // phát từ bộ nhớ, không gọi mạng
    await h.engine.toggle('sfx2');
    expect(status(h, 'sfx2')).toBe('error');
    expect(h.engine.getSnapshot().tracks.sfx2.errorMessage).toMatch(/mạng/);
  });

  it('Prepare Show tôn trọng ngân sách bộ nhớ preload', async () => {
    const big = (id: string) => cfg(id, 'SFX', { fileSizeBytes: 100 * 1024 * 1024 });
    const h = setup([big('a'), big('b'), big('c')], { maxPreloadBytes: 250 * 1024 * 1024 });
    const r = await h.engine.prepareShow(['a', 'b', 'c']);
    expect(r.ready).toBe(2);
    expect(r.skipped).toEqual(['c']);
    expect(status(h, 'c')).toBe('idle');
    expect(h.engine.getSnapshot().notice?.message).toMatch(/ngân sách/);
    expect(h.engine.getSnapshot().loadedBytes).toBe(200 * 1024 * 1024);
  });

  it('ngân sách RAM giải mã: file nhỏ nhưng nhạc dài vẫn bị chặn (MP3 10 phút ≈ 211 MB RAM)', async () => {
    const longMp3 = (id: string) => cfg(id, 'BGM', { fileSizeBytes: 10 * 1024 * 1024, durationSeconds: 600 });
    const h = setup([longMp3('a'), longMp3('b'), longMp3('c')], { maxDecodedBytes: 500 * 1024 * 1024 });
    const r = await h.engine.prepareShow(['a', 'b', 'c']);
    expect(r.ready).toBe(2); // 2 × ~211 MB ≤ 500 MB, bản thứ 3 vượt
    expect(r.skipped).toEqual(['c']);
    const snap = h.engine.getSnapshot();
    expect(snap.loadedBytes).toBe(20 * 1024 * 1024); // dung lượng file chỉ 20 MB…
    expect(snap.estimatedRamBytes).toBeGreaterThan(400 * 1024 * 1024); // …nhưng RAM ước tính > 400 MB
    // giải phóng → ước tính RAM giảm về 0
    h.engine.unloadTracks(['a', 'b']);
    expect(h.engine.getSnapshot().estimatedRamBytes).toBe(0);
  });

  it('phân biệt downloading ≠ decoding ≠ ready', async () => {
    const h = setup(sfxs(1));
    const g = h.hold('sfx1');
    const p = h.engine.prepareShow(['sfx1']);
    await flush();
    expect(h.engine.getSnapshot().tracks.sfx1).toMatchObject({ playbackStatus: 'loading', loadPhase: 'downloading' });
    g.resolve();
    await p;
    expect(h.engine.getSnapshot().tracks.sfx1).toMatchObject({ playbackStatus: 'ready', loadPhase: undefined });
  });

  it('A24: lỗi tải → error + Retry; retry thành công → ready, không fake playing', async () => {
    const h = setup(sfxs(1));
    h.failFetch('sfx1', 'Không có quyền đọc file');
    await h.engine.toggle('sfx1');
    expect(status(h, 'sfx1')).toBe('error');
    expect(playingIds(h)).toEqual([]);
    expect(await h.engine.toggle('sfx1')).toBe(false); // không tự thử lại khi bấm Play
    h.failFetch('sfx1', ''); // trống = không lỗi (map còn key → dùng provider mới)
    h.engine.setBlobProvider(async (c) => ({ __id: c.id }) as unknown as Blob);
    expect(await h.engine.retry('sfx1')).toBe(true);
    expect(status(h, 'sfx1')).toBe('ready');
  });

  it('play error của trình duyệt (autoplay) → error, không fake playing, SFX count đúng', async () => {
    const h = setup(sfxs(1));
    h.failPlay('sfx1');
    await h.engine.toggle('sfx1');
    expect(status(h, 'sfx1')).toBe('error');
    expect(h.engine.getSnapshot().activeSfxCount).toBe(0);
    expect(playingIds(h)).toEqual([]);
  });

  it('unloadTracks không đụng cue đang phát/tạm dừng', async () => {
    const h = setup(sfxs(3));
    await h.engine.prepareShow(['sfx1', 'sfx2', 'sfx3']);
    await h.engine.toggle('sfx1');
    await h.engine.toggle('sfx2');
    h.engine.toggle('sfx2'); // paused
    const n = h.engine.unloadTracks(['sfx1', 'sfx2', 'sfx3']);
    expect(n).toBe(1);
    expect(status(h, 'sfx3')).toBe('idle');
    expect(h.howls.get('sfx3')!.unloaded).toBe(true);
    expect(h.howls.get('sfx1')!.unloaded).toBe(false);
    expect(h.howls.get('sfx2')!.unloaded).toBe(false);
  });
});

describe('A25 — soak: đổi cue nhiều lần không rò rỉ', () => {
  it('500 lần chuyển BGM/SFX/stop all: số Howl ≤ số cue, blob URL cân bằng', async () => {
    const h = setup([...bgms(4), ...sfxs(6)]);
    const ids = [...bgms(4), ...sfxs(6)].map((c) => c.id);
    for (let i = 0; i < 500; i++) {
      const id = ids[i % ids.length];
      await h.engine.toggle(id);
      if (i % 7 === 0) h.engine.stopAll();
      if (i % 11 === 0) h.engine.unloadTracks(ids);
      const bgmPlaying = playingIds(h).filter((x) => x.startsWith('bgm'));
      expect(bgmPlaying.length).toBeLessThanOrEqual(1);
    }
    const counts = h.engine.debugCounts();
    expect(counts.howls).toBeLessThanOrEqual(ids.length);
    const live = h.createdHowls.filter((x) => !x.unloaded).length;
    expect(live).toBe(counts.howls);
    expect(h.createdUrls.length - h.revoked.length).toBe(counts.blobUrls);
    h.engine.dispose();
    expect(h.createdUrls.length).toBe(h.revoked.length);
  });
});

describe('tick (đồng hồ UI)', () => {
  it('đọc seek thực tế từ engine; phát hiện AudioContext bị suspend', async () => {
    vi.useFakeTimers();
    try {
      const h = makeHarness([cfg('a', 'BGM')], { tickMs: 100 });
      current = h;
      const p = h.engine.toggle('a');
      await vi.advanceTimersByTimeAsync(0);
      await p;
      h.howls.get('a')!.position = 4.2;
      await vi.advanceTimersByTimeAsync(250);
      expect(h.engine.getSnapshot().tracks.a.seekSeconds).toBe(4.2);
      h.ctx.state = 'suspended';
      await vi.advanceTimersByTimeAsync(250);
      expect(h.engine.getSnapshot().engineState).toBe('locked');
    } finally {
      vi.useRealTimers();
    }
  });
});
