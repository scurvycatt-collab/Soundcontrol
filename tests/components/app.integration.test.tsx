import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundDocument } from '../../src/types/sound';
import { makeHarness, type Harness } from '../audio-engine/harness';

const hoisted = vi.hoisted(() => ({
  harness: null as unknown as { engine: unknown },
  subscribed: 0,
  unsubscribed: 0,
  push: null as null | ((s: unknown) => void),
  role: 'operator' as 'admin' | 'operator' | null,
  missing: [] as string[],
}));

vi.mock('../../src/services/firebase', () => ({
  missingFirebaseConfig: () => hoisted.missing,
  getAuthInstance: () => ({}),
  getDb: () => ({}),
  getStorageInstance: () => ({}),
}));

vi.mock('../../src/audio/engineInstance', () => ({
  getEngine: () => hoisted.harness.engine,
  disposeEngine: () => undefined,
}));

vi.mock('../../src/services/soundRepository', () => ({
  subscribeSounds: (onData: (s: unknown) => void) => {
    hoisted.subscribed++;
    hoisted.push = onData;
    return () => void hoisted.unsubscribed++;
  },
  fetchSoundBlob: async (path: string) => ({ __id: path.split('/')[1] }) as unknown as Blob,
  updateSoundMetadata: vi.fn(),
  deleteStorageFile: vi.fn(),
  markSoundDeleting: vi.fn(),
  deleteSoundDoc: vi.fn(),
  createSoundDoc: vi.fn(),
}));

vi.mock('../../src/auth/AuthProvider', async () => {
  const React = await import('react');
  const AuthContext = React.createContext<unknown>(null);
  return {
    AuthContext,
    AuthProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        AuthContext.Provider,
        {
          value: {
            user: { uid: 'u1', email: 'op@theatre.test' },
            role: hoisted.role,
            loading: false,
            signIn: vi.fn(),
            signOut: vi.fn(),
            refreshRole: vi.fn(),
          },
        },
        children,
      ),
  };
});

const ts = { toMillis: () => 1 } as never;
const doc = (id: string, category: 'BGM' | 'SFX', title: string, over: Partial<SoundDocument> = {}): SoundDocument => ({
  id, title, scene: 'Cảnh 1', sceneOrder: 1, sortOrder: 1, category,
  storagePath: `sounds/${id}/a.mp3`, originalFilename: `${id}.mp3`, mimeType: 'audio/mpeg',
  fileSizeBytes: 1000, durationSeconds: 60, defaultVolume: 1, loopDefault: false, status: 'ready',
  createdAt: ts, updatedAt: ts, createdByUid: 'u', ...over,
});

const DOCS = [doc('bgm1', 'BGM', 'Nhạc mở màn'), doc('bgm2', 'BGM', 'Nhạc cao trào', { sortOrder: 2 }), doc('sfx1', 'SFX', 'Sấm sét'), doc('sfx2', 'SFX', 'Chuông cửa', { sortOrder: 2 })];

let h: Harness;
beforeEach(() => {
  h = makeHarness([], {}, { unlocked: false });
  hoisted.harness = h;
  hoisted.subscribed = 0;
  hoisted.unsubscribed = 0;
  hoisted.push = null;
  hoisted.role = 'operator';
  hoisted.missing = [];
});
afterEach(() => {
  cleanup();
  h.engine.dispose();
});

async function renderApp() {
  const { App } = await import('../../src/app/App');
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await waitFor(() => expect(hoisted.push).not.toBeNull());
  act(() => hoisted.push!({ sounds: DOCS, broken: [], invalid: [] }));
}
const item = (id: string) => within(screen.getByTestId(`audio-item-${id}`));

describe('App — tích hợp UI ↔ engine ↔ Firestore (mock)', () => {
  it('thiếu cấu hình Firebase → hướng dẫn, không sập', async () => {
    hoisted.missing = ['VITE_FIREBASE_API_KEY'];
    const { App } = await import('../../src/app/App');
    render(<App />);
    expect(screen.getByText('Chưa cấu hình Firebase')).toBeInTheDocument();
    expect(screen.getByText('VITE_FIREBASE_API_KEY')).toBeInTheDocument();
  });

  it('tài khoản không có role → màn hình chờ cấp quyền', async () => {
    hoisted.role = null;
    const { App } = await import('../../src/app/App');
    render(<App />);
    expect(screen.getByText('Tài khoản chưa được cấp quyền')).toBeInTheDocument();
  });

  it('A14: StrictMode → đúng 1 subscription Firestore và 1 engine', async () => {
    await renderApp();
    expect(hoisted.subscribed - hoisted.unsubscribed).toBe(1);
    expect(h.createdHowls).toHaveLength(0);
  });

  it('hiển thị BGM/SFX theo nhóm; operator không thấy Add Sounds / Sửa / Xóa', async () => {
    await renderApp();
    const bgm = within(screen.getByRole('region', { name: /Background Music/ }));
    const sfx = within(screen.getByRole('region', { name: /Sound Effects/ }));
    expect(bgm.getByText('Nhạc mở màn')).toBeInTheDocument();
    expect(sfx.getByText('Sấm sét')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Sounds/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.getByTestId('prepare-status')).toHaveTextContent('ready 0/4');
  });

  it('admin thấy Add Sounds, Sửa, Xóa', async () => {
    hoisted.role = 'admin';
    await renderApp();
    expect(screen.getByRole('button', { name: /Add Sounds/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(4);
  });

  it('A01/A02: chưa kích hoạt → Play bị chặn + cảnh báo; kích hoạt rồi mới phát', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(item('sfx1').getByRole('button', { name: /Phát Sấm sét/ }));
    await waitFor(() => expect(screen.getAllByText(/Audio bị trình duyệt chặn/).length).toBeGreaterThan(0));
    expect(h.createdHowls).toHaveLength(0);
    expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Idle');

    await user.click(screen.getByRole('button', { name: 'Kích hoạt âm thanh' }));
    await waitFor(() => expect(screen.getByTestId('engine-badge')).toHaveTextContent('Sẵn sàng'));
    await user.click(screen.getByRole('button', { name: 'Test Sound' }));
    expect(h.testTones).toBe(1);
    expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Idle'); // không tự phát lại
  });

  it('A03/A06: BGM chuyển bài, SFX song song, STOP ALL dừng tất cả', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Kích hoạt âm thanh' }));
    await user.click(item('bgm1').getByRole('button', { name: /Phát Nhạc mở màn/ }));
    await waitFor(() => expect(item('bgm1').getByTestId('status-badge')).toHaveTextContent('Playing'));
    await user.click(item('sfx1').getByRole('button', { name: /Phát Sấm sét/ }));
    await user.click(item('sfx2').getByRole('button', { name: /Phát Chuông cửa/ }));
    await waitFor(() => expect(item('sfx2').getByTestId('status-badge')).toHaveTextContent('Playing'));
    expect(item('bgm1')).toBeTruthy();
    expect(screen.getByText('BGM đang chọn')).toBeInTheDocument();

    await user.click(item('bgm2').getByRole('button', { name: /Phát Nhạc cao trào/ }));
    await waitFor(() => expect(item('bgm2').getByTestId('status-badge')).toHaveTextContent('Playing'));
    expect(item('bgm1').getByTestId('status-badge')).toHaveTextContent('Ready');
    expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Playing');

    // pause một SFX không đụng BGM
    await user.click(item('sfx1').getByRole('button', { name: /Tạm dừng Sấm sét/ }));
    expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Paused');
    expect(item('bgm2').getByTestId('status-badge')).toHaveTextContent('Playing');

    await user.click(screen.getByTestId('stop-all'));
    for (const id of ['bgm1', 'bgm2', 'sfx1', 'sfx2']) {
      expect(item(id).getByTestId('status-badge')).not.toHaveTextContent('Playing');
    }
    expect(h.createdHowls.every((x) => !x.playing)).toBe(true);
  });

  it('A13: Firestore đổi tên/cảnh khi đang phát → không tạo lại Howl, nhạc không dừng', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Kích hoạt âm thanh' }));
    await user.click(item('bgm1').getByRole('button', { name: /Phát Nhạc mở màn/ }));
    await waitFor(() => expect(item('bgm1').getByTestId('status-badge')).toHaveTextContent('Playing'));
    const howl = h.howls.get('bgm1')!;
    const stops = howl.stopCalls;

    act(() => hoisted.push!({ sounds: DOCS.map((d) => (d.id === 'bgm1' ? { ...d, title: 'Nhạc mở màn (v2)', scene: 'Cảnh 9' } : d)), broken: [], invalid: [] }));
    expect(await screen.findByText('Nhạc mở màn (v2)')).toBeInTheDocument();
    expect(howl.stopCalls).toBe(stops);
    expect(howl.playing).toBe(true);
    expect(h.createdHowls).toHaveLength(1);
  });

  it('lọc theo cảnh / tìm kiếm khi đang phát không tắt nhạc', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Kích hoạt âm thanh' }));
    await user.click(item('sfx1').getByRole('button', { name: /Phát Sấm sét/ }));
    await waitFor(() => expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Playing'));
    await user.type(screen.getByPlaceholderText(/Tên, cảnh/), 'chuông');
    expect(screen.queryByText('Sấm sét')).toBeNull(); // ẩn khỏi danh sách…
    expect(h.howls.get('sfx1')!.playing).toBe(true); // …nhưng vẫn phát
    await user.clear(screen.getByPlaceholderText(/Tên, cảnh/));
    expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Playing'); // remount item: trạng thái đúng
    expect(h.createdHowls).toHaveLength(1);
  });

  it('Prepare Show tải trước toàn bộ cue và cập nhật Ready X/Y', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: /Prepare Show/ }));
    await waitFor(() => expect(screen.getByTestId('prepare-status')).toHaveTextContent('ready 4/4'));
    expect(h.createdHowls).toHaveLength(4);
    expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Ready');
  });

  it('lỗi tải file hiện Error + nguyên nhân trên item', async () => {
    const user = userEvent.setup();
    await renderApp(); // App tự đặt blob provider (mock) → ép lỗi ở bước giải mã
    h.failDecode('sfx1');
    await user.click(screen.getByRole('button', { name: 'Kích hoạt âm thanh' }));
    await user.click(item('sfx1').getByRole('button', { name: /Phát Sấm sét/ }));
    await waitFor(() => expect(item('sfx1').getByTestId('status-badge')).toHaveTextContent('Error'));
    expect(item('sfx1').getByRole('alert')).toHaveTextContent(/giải mã/);
    expect(item('sfx1').getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
