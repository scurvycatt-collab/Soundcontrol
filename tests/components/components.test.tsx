import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioItem, type AudioActions } from '../../src/components/AudioItem';
import { AudioList } from '../../src/components/AudioList';
import { Header } from '../../src/components/Header';
import { StatusBanner } from '../../src/components/StatusBanner';
import type { EngineSnapshot } from '../../src/audio/types';
import type { SoundDocument, TrackRuntimeState } from '../../src/types/sound';
import { useAudioSnapshot } from '../../src/hooks/useAudioEngine';
import { cfg, makeHarness } from '../audio-engine/harness';

afterEach(() => cleanup());

const ts = { toMillis: () => 1 } as never;
const sound = (over: Partial<SoundDocument> = {}): SoundDocument => ({
  id: 's1', title: 'Mưa rơi', scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 1, category: 'SFX',
  storagePath: 'sounds/s1/a.mp3', originalFilename: 'mua.mp3', mimeType: 'audio/mpeg',
  fileSizeBytes: 1000, durationSeconds: 90, defaultVolume: 1, loopDefault: false, status: 'ready',
  createdAt: ts, updatedAt: ts, createdByUid: 'u', ...over,
});
const track = (over: Partial<TrackRuntimeState> = {}): TrackRuntimeState => ({
  soundId: 's1', playbackStatus: 'ready', seekSeconds: 0, durationSeconds: 90, volume: 1, loop: false, rate: 1, windowStartSeconds: 0, fileDurationSeconds: 90, ...over,
});
const mkActions = (): AudioActions => ({
  toggle: vi.fn(), stop: vi.fn(), replay: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), setLoop: vi.fn(), setRate: vi.fn(), retry: vi.fn(),
});
const renderItem = (t: TrackRuntimeState | undefined, extra: { online?: boolean; admin?: boolean } = {}) => {
  const actions = mkActions();
  render(
    <ul>
      <AudioItem sound={sound()} track={t} online={extra.online ?? true} isAdmin={extra.admin ?? false} isActiveBgm={false} actions={actions} />
    </ul>,
  );
  return actions;
};

describe('AudioItem — trạng thái hữu hình & điều khiển', () => {
  it.each([
    ['idle', 'Idle'], ['ready', 'Ready'], ['playing', 'Playing'], ['paused', 'Paused'], ['ended', 'Ended'], ['error', 'Error'],
  ] as const)('hiển thị trạng thái %s', (st, label) => {
    renderItem(track({ playbackStatus: st, errorMessage: st === 'error' ? 'Hỏng' : undefined }));
    expect(screen.getByTestId('status-badge')).toHaveTextContent(label);
  });

  it('loading hiển thị Downloading/Decoding và khóa Play, nhưng Stop (huỷ) còn dùng được', () => {
    renderItem(track({ playbackStatus: 'loading', loadPhase: 'decoding' }));
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Decoding');
    expect(screen.getByRole('button', { name: /Phát Mưa rơi/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Dừng Mưa rơi/ })).toBeEnabled();
  });

  it('Play gọi toggle; Pause khi đang phát; Stop, Replay, Loop gọi đúng hành động', async () => {
    const user = userEvent.setup();
    const a = renderItem(track({ playbackStatus: 'ready' }));
    await user.click(screen.getByRole('button', { name: /Phát Mưa rơi/ }));
    expect(a.toggle).toHaveBeenCalledWith('s1');
    await user.click(screen.getByRole('button', { name: /Phát lại/ }));
    expect(a.replay).toHaveBeenCalledWith('s1');
    await user.click(screen.getByRole('button', { name: /Lặp/ }));
    expect(a.setLoop).toHaveBeenCalledWith('s1', true);
  });

  it('đang phát: nút là Pause và Stop bật', async () => {
    const user = userEvent.setup();
    const a = renderItem(track({ playbackStatus: 'playing', seekSeconds: 65 }));
    expect(screen.getByRole('button', { name: /Tạm dừng Mưa rơi/ })).toHaveTextContent('Pause');
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByText('01:30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dừng Mưa rơi/ }));
    expect(a.stop).toHaveBeenCalledWith('s1');
  });

  it('A10: sóng âm bị khóa khi chưa phát; tua bằng bàn phím gọi seek', () => {
    const a = renderItem(track({ playbackStatus: 'ready' }));
    const locked = screen.getByRole('slider', { name: /Vị trí phát/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(locked, { key: 'ArrowRight' });
    expect(a.seek).not.toHaveBeenCalled();
    cleanup();
    const b = renderItem(track({ playbackStatus: 'playing', seekSeconds: 10 }));
    const slider = screen.getByRole('slider', { name: /Vị trí phát/ });
    expect(slider).toHaveAttribute('aria-disabled', 'false');
    expect(slider).toHaveAttribute('aria-valuenow', '10');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(b.seek).toHaveBeenLastCalledWith('s1', 11);
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(b.seek).toHaveBeenLastCalledWith('s1', 5);
  });

  it('khóa tua khi duration không hợp lệ', () => {
    renderItem(track({ playbackStatus: 'playing', durationSeconds: 0 }));
    expect(screen.getByRole('slider', { name: /Vị trí phát/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('volume track chuyển 0–100% thành 0–1', () => {
    const a = renderItem(track({ volume: 0.4 }));
    expect(screen.getByText('Vol 40%')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Âm lượng Mưa rơi/), { target: { value: '75' } });
    expect(a.setVolume).toHaveBeenCalledWith('s1', 0.75);
  });

  it('A24: error hiện nguyên nhân + Retry, không cho Play', async () => {
    const user = userEvent.setup();
    const a = renderItem(track({ playbackStatus: 'error', errorMessage: 'Không có quyền đọc file' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Không có quyền đọc file');
    expect(screen.getByRole('button', { name: /Phát Mưa rơi/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(a.retry).toHaveBeenCalledWith('s1');
  });

  it('A22: offline + chưa preload → Not ready / Offline, khóa Play; đã preload thì vẫn phát được', () => {
    renderItem(track({ playbackStatus: 'idle' }), { online: false });
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Not ready / Offline');
    expect(screen.getByRole('button', { name: /Phát Mưa rơi/ })).toBeDisabled();
    cleanup();
    renderItem(track({ playbackStatus: 'ready' }), { online: false });
    expect(screen.getByRole('button', { name: /Phát Mưa rơi/ })).toBeEnabled();
  });

  it('nút Sửa/Xóa chỉ hiện cho admin', () => {
    renderItem(track(), { admin: false });
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    cleanup();
    renderItem(track(), { admin: true });
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa' })).toBeInTheDocument();
  });
});

describe('AudioList', () => {
  it('trạng thái rỗng / đang tải; key theo id', () => {
    const base = { title: 'BGM', subtitle: '', tracks: {}, activeBgmId: null, online: true, isAdmin: true, actions: mkActions(), onEdit: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(<AudioList {...base} sounds={[]} loading={true} />);
    expect(screen.getByText(/Đang tải/)).toBeInTheDocument();
    rerender(<AudioList {...base} sounds={[]} loading={false} />);
    expect(screen.getByText(/Chưa có âm thanh/)).toBeInTheDocument();
    rerender(<AudioList {...base} sounds={[sound({ id: 'a', title: 'A' }), sound({ id: 'b', title: 'B' })]} loading={false} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('Header — STOP ALL luôn khả dụng', () => {
  const snapshot = (over: Partial<EngineSnapshot> = {}): EngineSnapshot => ({
    engineState: 'locked', masterVolume: 0.7, masterMuted: false, tracks: {}, activeBgmId: null, pendingBgmId: null,
    activeSfxCount: 0, anyPlaying: false, loadedBytes: 0, estimatedRamBytes: 0, prepare: { running: false, total: 0, done: 0, failed: 0 }, notice: null, ...over,
  });
  const handlers = () => ({
    onUnlock: vi.fn(), onTestSound: vi.fn(), onStopAll: vi.fn(), onMasterVolume: vi.fn(), onMasterMute: vi.fn(), onSignOut: vi.fn(),
  });

  it('A01: chưa kích hoạt → hiện nút Kích hoạt âm thanh; STOP ALL vẫn bấm được', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<Header snapshot={snapshot()} online={true} userLabel="a@b.c" role="admin" {...h} />);
    expect(screen.getByTestId('engine-badge')).toHaveTextContent('Chưa kích hoạt');
    await user.click(screen.getByRole('button', { name: 'Kích hoạt âm thanh' }));
    expect(h.onUnlock).toHaveBeenCalled();
    const stop = screen.getByTestId('stop-all');
    expect(stop).toBeEnabled();
    await user.click(stop); // không có modal xác nhận
    expect(h.onStopAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sẵn sàng ẩn nút kích hoạt; master volume, mute và trạng thái online', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<Header snapshot={snapshot({ engineState: 'ready' })} online={false} userLabel="a@b.c" role="operator" {...h} />);
    expect(screen.queryByRole('button', { name: 'Kích hoạt âm thanh' })).toBeNull();
    expect(screen.getByTestId('online-badge')).toHaveTextContent('Offline');
    fireEvent.change(screen.getByLabelText(/Master/), { target: { value: '30' } });
    expect(h.onMasterVolume).toHaveBeenCalledWith(0.3);
    await user.click(screen.getByRole('button', { name: /Mute/ }));
    expect(h.onMasterMute).toHaveBeenCalledWith(true);
  });
});

describe('StatusBanner', () => {
  it('hiển thị lỗi kèm hành động Retry', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<StatusBanner items={[{ key: 'e', level: 'error', message: 'Mất kết nối Firestore', actionLabel: 'Thử lại', onAction: retry }]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối Firestore');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('A13/A14 — StrictMode + remount với engine thật (mock Howl)', () => {
  it('mount/unmount/remount list và filter không tạo thêm Howl, không tắt nhạc', async () => {
    const h = makeHarness([cfg('s1', 'SFX'), cfg('bgm', 'BGM')]);
    await h.engine.toggle('s1');
    await h.engine.toggle('bgm');

    function Probe() {
      const snap = useAudioSnapshot(h.engine);
      const [filtered, setFiltered] = useState(false);
      const ids = filtered ? [] : Object.keys(snap.tracks);
      return (
        <div>
          <button onClick={() => setFiltered((f) => !f)}>toggle-filter</button>
          <ul>{ids.map((id) => <li key={id}>{id}:{snap.tracks[id].playbackStatus}</li>)}</ul>
        </div>
      );
    }
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByText('s1:playing')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) await user.click(screen.getByText('toggle-filter'));
    cleanup();
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByText('bgm:playing')).toBeInTheDocument();
    expect(h.createdHowls).toHaveLength(2); // không duplicate Howl
    expect(h.createdHowls.every((x) => !x.unloaded)).toBe(true);
    h.engine.dispose();
  });

  it('component cập nhật khi engine đổi trạng thái', async () => {
    const h = makeHarness([cfg('s1', 'SFX')]);
    function Probe() {
      const snap = useAudioSnapshot(h.engine);
      return <p>status:{snap.tracks.s1?.playbackStatus}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('status:idle')).toBeInTheDocument();
    await act(async () => {
      await h.engine.toggle('s1');
    });
    expect(screen.getByText('status:playing')).toBeInTheDocument();
    act(() => h.engine.stopAll());
    expect(screen.getByText('status:ready')).toBeInTheDocument();
    h.engine.dispose();
  });
});

describe('A14 — useSounds trong StrictMode: đúng 1 subscription', () => {
  it('subscribe/unsubscribe cân bằng; lỗi giữ nguyên danh sách', async () => {
    vi.resetModules();
    const active = { subscribed: 0, unsubscribed: 0 };
    let onData!: (s: unknown) => void;
    let onError!: (e: unknown) => void;
    vi.doMock('../../src/services/soundRepository', () => ({
      subscribeSounds: (d: typeof onData, e: typeof onError) => {
        active.subscribed++;
        onData = d;
        onError = e;
        return () => void active.unsubscribed++;
      },
    }));
    const { useSounds } = await import('../../src/hooks/useSounds');
    const { result, unmount } = renderHook(() => useSounds(), { wrapper: StrictMode });
    expect(active.subscribed - active.unsubscribed).toBe(1);

    const snap = { sounds: [sound()], broken: [], invalid: [] };
    act(() => onData(snap));
    expect(result.current.sounds).toHaveLength(1);
    expect(result.current.loading).toBe(false);

    act(() => onError({ code: 'unavailable' }));
    await waitFor(() => expect(result.current.error).toMatch(/Firestore/));
    expect(result.current.sounds).toHaveLength(1); // không xóa danh sách khi mất kết nối

    unmount();
    expect(active.subscribed - active.unsubscribed).toBe(0);
    vi.doUnmock('../../src/services/soundRepository');
  });
});
