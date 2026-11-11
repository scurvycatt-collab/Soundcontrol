import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioItem, type AudioActions } from '../../src/components/AudioItem';
import { EditSoundModal } from '../../src/components/EditSoundModal';
import type { SoundDocument, TrackRuntimeState } from '../../src/types/sound';

afterEach(() => cleanup());
const ts = { toMillis: () => 1 } as never;
const sound = (over: Partial<SoundDocument> = {}): SoundDocument => ({
  id: 's1', title: 'Sấm', scene: 'Đoạn 1.1', sceneOrder: 1, sortOrder: 1, category: 'SFX',
  storagePath: 'sounds/s1/a.mp3', originalFilename: 'a.mp3', mimeType: 'audio/mpeg',
  fileSizeBytes: 1000, durationSeconds: 10, defaultVolume: 1, loopDefault: false, status: 'ready',
  createdAt: ts, updatedAt: ts, createdByUid: 'u', ...over,
});
const track = (over: Partial<TrackRuntimeState> = {}): TrackRuntimeState => ({
  soundId: 's1', playbackStatus: 'ready', seekSeconds: 0, durationSeconds: 10, volume: 1, loop: false, rate: 1, windowStartSeconds: 0, fileDurationSeconds: 10, ...over,
});
const actions = (): AudioActions => ({
  toggle: vi.fn(), stop: vi.fn(), replay: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), setLoop: vi.fn(), setRate: vi.fn(), retry: vi.fn(),
});

describe('AudioItem — tốc độ & cắt', () => {
  it('chọn tốc độ gọi setRate; ↺ chỉ hiện khi khác mặc định', async () => {
    const a = actions();
    const { rerender } = render(<ul><AudioItem sound={sound()} track={track()} online isAdmin={false} isActiveBgm={false} actions={a} /></ul>);
    expect(screen.queryByLabelText('Đặt lại tốc độ Sấm')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Tốc độ Sấm', { selector: 'select' }), '1.5');
    expect(a.setRate).toHaveBeenCalledWith('s1', 1.5);
    rerender(<ul><AudioItem sound={sound()} track={track({ rate: 1.5 })} online isAdmin={false} isActiveBgm={false} actions={a} /></ul>);
    await userEvent.click(screen.getByLabelText('Đặt lại tốc độ Sấm'));
    expect(a.setRate).toHaveBeenLastCalledWith('s1', 1);
  });
  it('hiện badge ✂ khi có điểm cắt', () => {
    render(<ul><AudioItem sound={sound({ trimStart: 2, trimEnd: 5 })} track={track({ windowStartSeconds: 2, durationSeconds: 3 })} online isAdmin={false} isActiveBgm={false} actions={actions()} /></ul>);
    expect(screen.getByText(/✂/).textContent).toContain('2.00–5.00');
  });
});

describe('EditSoundModal — cắt & tốc độ', () => {
  const open = (over: Partial<SoundDocument> = {}, isActive = false) => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditSoundModal sound={sound(over)} isActive={isActive} fileDuration={10} onSave={onSave} onClose={vi.fn()} />);
    return onSave;
  };
  it('lưu điểm cắt đã nhập + bỏ cắt về 0', async () => {
    const onSave = open();
    const start = screen.getByLabelText(/Bắt đầu/);
    fireEvent.change(start, { target: { value: '2' } });
    fireEvent.blur(start);
    const end = screen.getByLabelText(/Kết thúc \(giây\)/);
    fireEvent.change(end, { target: { value: '5' } });
    fireEvent.blur(end);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ trimStart: 2, trimEnd: 5, playbackRate: 1 });
  });
  it('không cắt: lưu trimStart/trimEnd = 0', async () => {
    const onSave = open();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ trimStart: 0, trimEnd: 0 });
  });
  it('kết thúc ≤ bắt đầu bị kẹp, không lưu khoảng rỗng', async () => {
    const onSave = open();
    const start = screen.getByLabelText(/Bắt đầu/);
    fireEvent.change(start, { target: { value: '4' } }); fireEvent.blur(start);
    const end = screen.getByLabelText(/Kết thúc \(giây\)/);
    fireEvent.change(end, { target: { value: '3' } }); fireEvent.blur(end);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const p = onSave.mock.calls[0][0];
    expect(p.trimEnd - p.trimStart).toBeGreaterThanOrEqual(0.0999);
  });
  it('đang phát: ô cắt bị khóa', () => {
    open({}, true);
    expect((screen.getByLabelText(/Bắt đầu/) as HTMLInputElement).disabled).toBe(true);
  });
});
