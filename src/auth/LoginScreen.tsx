import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-stage-800 p-6 border border-stage-600">
        <h1 className="text-xl font-bold">Stage Audio Control</h1>
        <p className="text-sm text-slate-400">Đăng nhập bằng tài khoản do quản trị viên cấp.</p>
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md bg-stage-950 border border-stage-600 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Mật khẩu
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md bg-stage-950 border border-stage-600 px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50 py-2 font-semibold"
        >
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}
