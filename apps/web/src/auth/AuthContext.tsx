import type { Permission, UserDTO } from '@tiffino/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  onSessionExpired,
  onSessionRefreshed,
  refreshSession,
  setAccessToken,
} from '../api/client';
import * as endpoints from '../api/endpoints';

const USER_STORAGE_KEY = 'tiffino_user';

function readCachedUser(): UserDTO | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserDTO;
    // A malformed cache (e.g. missing permissions) must fall back to the normal
    // boot path instead of crashing can() later.
    return parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      Array.isArray(parsed.permissions)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function persistUser(user: UserDTO | null): void {
  try {
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

interface AuthContextValue {
  user: UserDTO | null;
  /** True until the silent cookie-refresh attempt on mount settles. */
  booting: boolean;
  login: (email: string, password: string) => Promise<UserDTO>;
  logout: () => Promise<void>;
  /** Drop the local session without calling the server (e.g. after password change). */
  clearSession: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(() => readCachedUser());
  const [booting, setBooting] = useState(true);
  const queryClient = useQueryClient();
  const userRef = useRef(user);
  userRef.current = user;

  const applyUser = useCallback((next: UserDTO | null) => {
    setUser(next);
    persistUser(next);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    applyUser(null);
    queryClient.clear();
  }, [applyUser, queryClient]);

  useEffect(() => {
    onSessionRefreshed((auth) => applyUser(auth.user));
    onSessionExpired(() => {
      if (userRef.current) clearSession();
    });
    // Silent session restore from the httpOnly refresh cookie.
    let active = true;
    refreshSession()
      .then((auth) => {
        if (!active) return;
        if (auth) applyUser(auth.user);
        else if (auth === null && userRef.current) {
          // The SERVER rejected the cookie — force a fresh login. On `undefined`
          // (network hiccup) keep the cached user: the next 401 retries refresh.
          setAccessToken(null);
          applyUser(null);
        }
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const auth = await endpoints.login(email, password);
      setAccessToken(auth.accessToken);
      applyUser(auth.user);
      queryClient.clear();
      return auth.user;
    },
    [applyUser, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await endpoints.logout();
    } catch {
      /* best-effort — the local session is dropped regardless */
    }
    clearSession();
  }, [clearSession]);

  const can = useCallback(
    (permission: Permission) =>
      !!user && (user.role === 'owner' || (user.permissions ?? []).includes(permission)),
    [user],
  );

  const value = useMemo(
    () => ({ user, booting, login, logout, clearSession, can }),
    [user, booting, login, logout, clearSession, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** `useCan('orders.book')` → boolean. Owner passes everything. */
export function useCan(permission: Permission): boolean {
  return useAuth().can(permission);
}

/** When a component needs to check several permissions, grab the function once. */
export function useCanFn(): (permission: Permission) => boolean {
  return useAuth().can;
}
