import type { EngineSnapshot } from '../audio/types';

interface Props {
  snapshot: EngineSnapshot;
  online: boolean;
  userLabel: string;
  role: string;
  onUnlock: () => void;
  onTestSound: () => void;
  onStopAll: () => void;
  onMasterVolume: (v: number) => void;
  onMasterMute: (m: boolean) => void;
  onSignOut?: () => void;
}

const ENGINE_LABEL = { locked: 'Chưa kích hoạt', ready: 'Sẵn sàng', error: 'Lỗi' } as const;
const ENGINE_STYLE = {
  locked: 'bg-amber-400 text-slate-950',
  ready: 'bg-emerald-500 text-slate-950',
  error: 'bg-red-600 text-white',
} as const;

export function Header({
  snapshot, online, userLabel, role, onUnlock, onTestSound, onStopAll, onMasterVolume, onMasterMute, onSignOut,
}: Props) {
  const { engineState, masterVolume, masterMuted } = snapshot;
  return (
    <header className="sticky top-0 z-30 border-b border-stage-600 bg-stage-900/95 backdrop-blur px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="text-lg font-extrabold tracking-tight">🎭 Stage Audio Control</h1>

        <span
          data-testid="online-badge"
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-600 text-white'}`}
        >
          {online ? 'Online' : 'Offline'}
        </span>

        <span data-testid="engine-badge" className={`rounded-full px-2.5 py-1 text-xs font-bold ${ENGINE_STYLE[engineState]}`}>
          Audio: {ENGINE_LABEL[engineState]}
        </span>

        {engineState !== 'ready' && (
          <button type="button" className="btn h-10 px-4 bg-amber-400 text-slate-950 hover:bg-amber-300" onClick={onUnlock}>
            Kích hoạt âm thanh
          </button>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="master-volume" className="text-xs text-slate-400">
            Master {Math.round(masterVolume * 100)}%
          </label>
          <input
            id="master-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(masterVolume * 100)}
            onChange={(e) => onMasterVolume(Number(e.target.value) / 100)}
            className="w-36 h-8"
          />
          <button
            type="button"
            aria-pressed={masterMuted}
            className={`btn h-10 px-3 text-sm ${masterMuted ? 'bg-red-600 hover:bg-red-500' : 'bg-stage-700 hover:bg-stage-600'}`}
            onClick={() => onMasterMute(!masterMuted)}
          >
            {masterMuted ? '🔇 Muted' : '🔈 Mute'}
          </button>
        </div>

        <button type="button" className="btn h-10 px-3 text-sm bg-stage-700 hover:bg-stage-600" onClick={onTestSound}>
          Test Sound
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 md:inline" title={userLabel}>
            {userLabel} · {role}
          </span>
          {onSignOut && (
            <button type="button" className="btn h-9 px-3 text-xs bg-stage-700 hover:bg-stage-600" onClick={onSignOut}>
              Đăng xuất
            </button>
          )}
          {/* STOP ALL: luôn khả dụng, không modal xác nhận */}
          <button
            type="button"
            data-testid="stop-all"
            onClick={onStopAll}
            className="btn h-14 min-w-36 px-6 text-xl font-black bg-red-600 hover:bg-red-500 active:bg-red-700 text-white ring-2 ring-red-300"
          >
            ■ STOP ALL
          </button>
        </div>
      </div>
    </header>
  );
}
