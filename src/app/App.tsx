import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext, AuthProvider, type AuthContextValue } from '../auth/AuthProvider';
import { IS_DEMO } from '../config';
import { DemoTools } from '../components/DemoTools';
import { demoClearAll, demoSeedSamples } from '../demo/demoStore';
import { LoginScreen } from '../auth/LoginScreen';
import { AudioList } from '../components/AudioList';
import type { AudioActions } from '../components/AudioItem';
import { BrokenSoundsPanel } from '../components/BrokenSoundsPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditSoundModal } from '../components/EditSoundModal';
import { Header } from '../components/Header';
import { StatusBanner, type BannerItem } from '../components/StatusBanner';
import { Toolbar } from '../components/Toolbar';
import { UploadModal } from '../components/UploadModal';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useOnline';
import { useSounds } from '../hooks/useSounds';
import { useTabGuard } from '../hooks/useTabGuard';
import { useUnloadWarning } from '../hooks/useUnloadWarning';
import { deleteSound } from '../services/deleteService';
import { missingFirebaseConfig } from '../services/firebase';
import { fetchSoundBlob, updateSoundMetadata } from '../services/soundRepository';
import type { SoundDocument, SoundMetadataPatch } from '../types/sound';
import { filterSounds, listScenes, sortSounds, toTrackConfig, type SortMode } from '../utils/soundDoc';

const DEMO_AUTH: AuthContextValue = {
  user: null,
  role: 'admin',
  loading: false,
  signIn: async () => undefined,
  signOut: async () => undefined,
  refreshRole: async () => undefined,
};

export function App() {
  if (IS_DEMO) {
    return (
      <AuthContext.Provider value={DEMO_AUTH}>
        <Console uid="demo" label="Demo (cục bộ)" role="admin" />
      </AuthContext.Provider>
    );
  }
  const missing = missingFirebaseConfig();
  if (missing.length > 0) return <ConfigMissing missing={missing} />;
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function ConfigMissing({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto max-w-xl p-8 space-y-3">
      <h1 className="text-xl font-bold">Chưa cấu hình Firebase</h1>
      <p className="text-slate-300">
        Sao chép <code>.env.example</code> thành <code>.env</code> và điền Firebase web config. Còn thiếu:
      </p>
      <ul className="list-disc pl-6 text-amber-300">
        {missing.map((m) => (
          <li key={m}>
            <code>{m}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}

function AuthGate() {
  const { user, role, loading, signOut, refreshRole } = useAuth();
  if (loading) {
    return <main className="p-8 text-slate-300">Đang kiểm tra đăng nhập…</main>;
  }
  if (!user) return <LoginScreen />;
  if (!role) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-8">
        <h1 className="text-xl font-bold">Tài khoản chưa được cấp quyền</h1>
        <p className="text-slate-300">
          <strong>{user.email}</strong> chưa có role <code>admin</code> hoặc <code>operator</code>. Nhờ quản trị viên chạy
          <code> npm run set-role</code>, sau đó bấm “Kiểm tra lại”.
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn h-10 px-4 bg-sky-600 hover:bg-sky-500" onClick={() => void refreshRole()}>
            Kiểm tra lại
          </button>
          <button type="button" className="btn h-10 px-4 bg-stage-700 hover:bg-stage-600" onClick={() => void signOut()}>
            Đăng xuất
          </button>
        </div>
      </main>
    );
  }
  return <Console uid={user.uid} label={user.email ?? user.uid} role={role} />;
}

function Console({ uid, label, role }: { uid: string; label: string; role: 'admin' | 'operator' }) {
  const isAdmin = role === 'admin';
  const { engine, snapshot } = useAudioEngine();
  const online = useOnline();
  const { signOut } = useAuth();
  const { sounds, broken, invalid, loading, error: soundsError, retry: retrySounds } = useSounds();

  const [query, setQuery] = useState('');
  const [scene, setScene] = useState('');
  const [sort, setSort] = useState<SortMode>('scene');
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<SoundDocument | null>(null);
  const [deleting, setDeleting] = useState<SoundDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Nguồn tải file + đồng bộ metadata → engine (engine không bị tạo lại khi metadata đổi).
  useEffect(() => {
    engine.setBlobProvider((cfg) => fetchSoundBlob(cfg.storagePath));
  }, [engine]);
  useEffect(() => {
    engine.syncSounds(sounds.map(toTrackConfig));
  }, [engine, sounds]);

  useUnloadWarning(snapshot.anyPlaying);
  const otherTabPlaying = useTabGuard(snapshot.anyPlaying);

  // Thông báo không phải lỗi tự biến mất.
  const notice = snapshot.notice;
  useEffect(() => {
    if (!notice || notice.level === 'error') return;
    const t = setTimeout(() => engine.dismissNotice(), 8000);
    return () => clearTimeout(t);
  }, [engine, notice]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const actions = useMemo<AudioActions>(
    () => ({
      toggle: (id) => void engine.toggle(id),
      stop: (id) => void engine.stop(id),
      replay: (id) => void engine.replay(id),
      seek: (id, s) => void engine.seek(id, s),
      setVolume: (id, v) => engine.setTrackVolume(id, v),
      setLoop: (id, l) => engine.setLoop(id, l),
      retry: (id) => void engine.retry(id),
    }),
    [engine],
  );

  const scenes = useMemo(() => listScenes(sounds), [sounds]);
  const visible = useMemo(
    () => sortSounds(filterSounds(sounds, { query, scene }), sort),
    [sounds, query, scene, sort],
  );
  const bgm = useMemo(() => visible.filter((s) => s.category === 'BGM'), [visible]);
  const sfx = useMemo(() => visible.filter((s) => s.category === 'SFX'), [visible]);

  const readyCount = useMemo(
    () =>
      sounds.filter((s) => {
        const st = snapshot.tracks[s.id]?.playbackStatus;
        return st === 'ready' || st === 'playing' || st === 'paused' || st === 'ended';
      }).length,
    [sounds, snapshot.tracks],
  );

  const onPrepareAll = useCallback(() => void engine.prepareShow(sounds.map((s) => s.id)), [engine, sounds]);
  const onPrepareScene = useCallback(
    () => void engine.prepareShow(sounds.filter((s) => s.scene === scene).map((s) => s.id)),
    [engine, sounds, scene],
  );
  const onUnloadOthers = useCallback(() => {
    const keep = new Set(visible.map((s) => s.id));
    const n = engine.unloadTracks(sounds.filter((s) => !keep.has(s.id)).map((s) => s.id));
    setFlash(n > 0 ? `Đã giải phóng ${n} cue khỏi bộ nhớ.` : 'Không có cue nào cần giải phóng.');
  }, [engine, sounds, visible]);

  const isActive = (id: string) => {
    const st = snapshot.tracks[id]?.playbackStatus;
    return st === 'playing' || st === 'paused';
  };

  const onSaveEdit = async (patch: SoundMetadataPatch) => {
    if (!editing) return;
    if (patch.category !== editing.category && isActive(editing.id)) {
      engine.stop(editing.id); // bảo toàn bất biến BGM/SFX: dừng trước khi đổi nhóm
    }
    await updateSoundMetadata(editing.id, patch);
  };

  const runDelete = async (s: SoundDocument): Promise<string | null> => {
    engine.stop(s.id); // không xóa khi đang phát
    const outcome = await deleteSound(s);
    return outcome.ok ? null : outcome.message;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const err = await runDelete(deleting);
    setDeleteBusy(false);
    if (err) {
      setDeleteError(err);
    } else {
      setFlash(`Đã xóa “${deleting.title}”.`);
      setDeleting(null);
    }
  };

  const banners: BannerItem[] = [];
  if (IS_DEMO) {
    banners.push({
      key: 'demo',
      level: 'info',
      message:
        sounds.length === 0
          ? 'CHẾ ĐỘ DEMO: không dùng Firebase; file lưu trong trình duyệt này. Bấm “Tạo âm mẫu” để thử ngay, hoặc “Add Sounds” để thêm MP3/WAV của bạn.'
          : 'CHẾ ĐỘ DEMO: không dùng Firebase; file lưu trong trình duyệt này (IndexedDB).',
      actionLabel: sounds.length === 0 ? 'Tạo âm mẫu' : 'Xóa toàn bộ dữ liệu demo',
      onAction: () => {
        if (sounds.length === 0) void demoSeedSamples().then((n) => setFlash(`Đã tạo ${n} âm mẫu.`));
        else if (window.confirm('Xóa toàn bộ âm thanh trong trình duyệt này? (Nên xuất tệp show trước.)')) {
          engine.stopAll();
          void demoClearAll();
        }
      },
    });
  }
  if (!online) {
    banners.push({
      key: 'offline',
      level: 'warn',
      message: 'Mất kết nối mạng. Cue đã tải xong (Ready) vẫn phát được trong phiên này; cue chưa tải hiển thị “Not ready / Offline”. Đừng reload trang.',
    });
  }
  if (soundsError) {
    banners.push({ key: 'sounds-error', level: 'error', message: soundsError, actionLabel: 'Thử lại', onAction: retrySounds });
  }
  if (otherTabPlaying) {
    banners.push({
      key: 'other-tab',
      level: 'warn',
      message: 'Một tab khác của ứng dụng (cùng trình duyệt) đang phát âm thanh. Hãy chắc chắn chỉ một tab điều khiển.',
    });
  }
  if (snapshot.engineState !== 'ready') {
    banners.push({ key: 'locked', level: 'warn', message: 'Âm thanh chưa được kích hoạt. Bấm “Kích hoạt âm thanh” trước khi bắt đầu show.' });
  }
  if (notice) {
    banners.push({ key: `notice-${notice.id}`, level: notice.level, message: notice.message, onDismiss: () => engine.dismissNotice() });
  }
  if (flash) banners.push({ key: 'flash', level: 'info', message: flash, onDismiss: () => setFlash(null) });

  return (
    <div className="min-h-screen pb-16">
      <Header
        snapshot={snapshot}
        online={online}
        userLabel={label}
        role={role}
        onUnlock={() => void engine.unlock()}
        onTestSound={() => engine.testSound()}
        onStopAll={() => engine.stopAll()}
        onMasterVolume={(v) => engine.setMasterVolume(v)}
        onMasterMute={(m) => engine.setMasterMute(m)}
        onSignOut={
          IS_DEMO
            ? undefined
            : () => {
                engine.stopAll();
                void signOut();
              }
        }
      />
      <StatusBanner items={banners} />
      {IS_DEMO && <DemoTools onMessage={setFlash} />}
      <Toolbar
        query={query}
        onQuery={setQuery}
        scene={scene}
        scenes={scenes}
        onScene={setScene}
        sort={sort}
        onSort={setSort}
        readyCount={readyCount}
        totalCount={sounds.length}
        loadedBytes={snapshot.loadedBytes}
        estimatedRamBytes={snapshot.estimatedRamBytes}
        prepare={snapshot.prepare}
        online={online}
        isAdmin={isAdmin}
        onPrepareAll={onPrepareAll}
        onPrepareScene={onPrepareScene}
        onUnloadOthers={onUnloadOthers}
        onAdd={() => setShowUpload(true)}
      />
      {isAdmin && (
        <BrokenSoundsPanel broken={broken} invalid={invalid} onRetryDelete={runDelete} />
      )}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pt-4 lg:grid-cols-2">
        <AudioList
          title="Background Music (BGM)"
          subtitle="Chỉ 1 BGM phát cùng lúc"
          sounds={bgm}
          tracks={snapshot.tracks}
          activeBgmId={snapshot.activeBgmId}
          online={online}
          isAdmin={isAdmin}
          loading={loading}
          actions={actions}
          onEdit={setEditing}
          onDelete={(s) => {
            setDeleteError(null);
            setDeleting(s);
          }}
        />
        <AudioList
          title="Sound Effects (SFX)"
          subtitle={`Đang phát: ${snapshot.activeSfxCount}`}
          sounds={sfx}
          tracks={snapshot.tracks}
          activeBgmId={null}
          online={online}
          isAdmin={isAdmin}
          loading={loading}
          actions={actions}
          onEdit={setEditing}
          onDelete={(s) => {
            setDeleteError(null);
            setDeleting(s);
          }}
        />
      </main>

      {showUpload && (
        <UploadModal
          uid={uid}
          scenes={scenes}
          onClose={() => setShowUpload(false)}
          onUploaded={(t) => setFlash(`Đã thêm “${t}”.`)}
        />
      )}
      {editing && (
        <EditSoundModal sound={editing} isActive={isActive(editing.id)} onSave={onSaveEdit} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title="Xóa âm thanh?"
          confirmLabel="Xóa vĩnh viễn"
          danger
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        >
          Xóa “{deleting.title}” khỏi Storage và danh sách. {isActive(deleting.id) && 'Âm thanh đang phát sẽ được DỪNG trước. '}
          Không thể hoàn tác.
        </ConfirmDialog>
      )}
    </div>
  );
}
