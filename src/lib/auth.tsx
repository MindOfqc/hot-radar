import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  api,
  clearToken,
  getToken,
  setToken,
  type CloudUser,
  type LastLogin,
} from './api';

const USER_CACHE_KEY = 'hotradar:auth-user';

interface AuthResponse {
  token?: string;
  expiresAt?: string;
  user: CloudUser;
  lastLogin?: LastLogin | null;
}

interface AuthContextValue {
  ready: boolean;
  user: CloudUser | null;
  lastLogin: LastLogin | null;
  login: (email: string, password: string) => Promise<CloudUser>;
  register: (input: {
    email: string;
    code: string;
    password: string;
    nickname: string;
  }) => Promise<CloudUser>;
  resetPassword: (input: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
  sendCode: (email: string, purpose: 'register' | 'reset') => Promise<{ devCode?: string }>;
  saveProfile: (patch: { nickname: string; avatar: string; bio: string }) => Promise<CloudUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedUser(): CloudUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudUser;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function cacheUser(user: CloudUser | null): void {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* 忽略 */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<CloudUser | null>(() => readCachedUser());
  const [lastLogin, setLastLogin] = useState<LastLogin | null>(null);

  const adopt = useCallback((response: AuthResponse) => {
    if (response.token) setToken(response.token);
    setUser(response.user);
    setLastLogin(response.lastLogin ?? null);
    cacheUser(response.user);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return () => {
        alive = false;
      };
    }
    void api<AuthResponse>('/api/auth/me')
      .then((response) => {
        if (!alive) return;
        setUser(response.user);
        setLastLogin(response.lastLogin ?? null);
        cacheUser(response.user);
      })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearToken();
          setUser(null);
          cacheUser(null);
        }
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const ping = () => {
      void api('/api/presence', { method: 'POST' }).catch(() => {
        /* 心跳失败不打扰 */
      });
    };
    ping();
    const timer = window.setInterval(ping, 60_000);
    return () => window.clearInterval(timer);
  }, [user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      adopt(response);
      return response.user;
    },
    [adopt],
  );

  const register = useCallback(
    async (input: { email: string; code: string; password: string; nickname: string }) => {
      const response = await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: input,
      });
      adopt(response);
      return response.user;
    },
    [adopt],
  );

  const resetPassword = useCallback(
    async (input: { email: string; code: string; newPassword: string }) => {
      await api('/api/auth/password', { method: 'POST', body: input });
    },
    [],
  );

  const sendCode = useCallback(async (email: string, purpose: 'register' | 'reset') => {
    return api<{ ok: boolean; devCode?: string }>('/api/auth/code', {
      method: 'POST',
      body: { email, purpose },
    });
  }, []);

  const saveProfile = useCallback(
    async (patch: { nickname: string; avatar: string; bio: string }) => {
      const response = await api<{ user: CloudUser }>('/api/user/profile', {
        method: 'PUT',
        body: patch,
      });
      setUser(response.user);
      cacheUser(response.user);
      return response.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 离线也能退出本机 */
    }
    clearToken();
    setUser(null);
    setLastLogin(null);
    cacheUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      lastLogin,
      login,
      register,
      resetPassword,
      sendCode,
      saveProfile,
      logout,
    }),
    [ready, user, lastLogin, login, register, resetPassword, sendCode, saveProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
