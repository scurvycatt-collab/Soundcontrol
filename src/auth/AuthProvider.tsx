import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from 'firebase/auth';
import { getAuthInstance } from '../services/firebase';
import { describeAuthError } from '../utils/errors';

export type Role = 'admin' | 'operator' | null;

export interface AuthContextValue {
  user: User | null;
  role: Role;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Lấy lại token để nhận role mới (sau khi admin cấp quyền). */
  refreshRole(): Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

async function readRole(user: User, forceRefresh: boolean): Promise<Role> {
  const token = await user.getIdTokenResult(forceRefresh);
  const r = token.claims.role;
  return r === 'admin' || r === 'operator' ? r : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(getAuthInstance(), (u) => {
      setLoading(true);
      if (!u) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }
      readRole(u, false)
        .then((r) => {
          if (cancelled) return;
          setUser(u);
          setRole(r);
        })
        .catch(() => {
          if (cancelled) return;
          setUser(u);
          setRole(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getAuthInstance(), email.trim(), password);
    } catch (err) {
      throw new Error(describeAuthError(err));
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(getAuthInstance());
  }, []);

  const refreshRole = useCallback(async () => {
    const u = getAuthInstance().currentUser;
    if (!u) return;
    setRole(await readRole(u, true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, role, loading, signIn, signOut, refreshRole }),
    [user, role, loading, signIn, signOut, refreshRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
