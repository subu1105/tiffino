import type { AuthResultDTO, Permission, UserDTO } from '@tiffino/shared';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  apiPost,
  clearSession,
  getCachedUser,
  getRefreshToken,
  refreshSession,
  setAccessToken,
  setCachedUser,
  setOnAuthFailure,
  setRefreshToken,
} from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserDTO | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Drop the local session without calling the server (e.g. after a password
   *  change revoked every token) and land on the login screen deliberately. */
  signOutLocally: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserDTO | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Cold start: paint instantly from the cached user, then silently refresh.
  useEffect(() => {
    let active = true;
    (async () => {
      const [cachedUser, refreshToken] = await Promise.all([getCachedUser(), getRefreshToken()]);
      if (!refreshToken) {
        if (active) setStatus('anonymous');
        return;
      }
      if (cachedUser && active) {
        setUser(cachedUser);
        setStatus('authenticated');
      }
      try {
        await refreshSession();
        const freshUser = await getCachedUser();
        if (active && freshUser) {
          setUser(freshUser);
          setStatus('authenticated');
        }
      } catch (err) {
        // Only a server 401 means the session is dead. On a network error /
        // server restart keep the cached session: the next 401 retries refresh.
        const sessionDead = err instanceof ApiError && err.status === 401;
        if (sessionDead) {
          await clearSession();
          if (active) {
            setUser(null);
            setStatus('anonymous');
          }
        } else if (active && !cachedUser) {
          // Nothing cached to show — land on login, but KEEP the stored refresh
          // token so a later cold start with connectivity restores the session.
          setStatus('anonymous');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // A failed mid-session refresh anywhere in the app forces re-login.
  useEffect(() => {
    setOnAuthFailure(() => {
      if (mounted.current) {
        setUser(null);
        setStatus('anonymous');
      }
    });
    return () => setOnAuthFailure(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiPost<AuthResultDTO>('/auth/login', { email, password });
    setAccessToken(result.accessToken);
    if (result.refreshToken) await setRefreshToken(result.refreshToken);
    await setCachedUser(result.user);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const signOutLocally = useCallback(async () => {
    await clearSession();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    try {
      await apiPost('/auth/logout', refreshToken ? { refreshToken } : {});
    } catch {
      // Best effort — the server token expires on its own; local state must clear regardless.
    }
    await signOutLocally();
  }, [signOutLocally]);

  const can = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      if (user.role === 'owner') return true;
      return user.permissions.includes(permission);
    },
    [user],
  );

  const value = useMemo(
    () => ({ status, user, login, logout, signOutLocally, can }),
    [status, user, login, logout, signOutLocally, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Permission check helper: owner passes everything, staff checks the grant list. */
export function useCan(): (permission: Permission) => boolean {
  return useAuth().can;
}
