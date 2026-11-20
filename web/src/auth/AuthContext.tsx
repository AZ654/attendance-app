import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicUser, TokenResponse } from '../types';
import { api, setAccessToken, getAccessToken } from '../api/client';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  devMode: boolean | null;
  loginDev: (openid?: string) => Promise<void>;
  loginByCode: (code: string, state?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [devMode, setDevMode] = useState<boolean | null>(null);

  const applyTokens = useCallback((data: TokenResponse) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  // 初始化：查询是否为开发模式，并尝试用 Cookie 静默恢复登录态
  useEffect(() => {
    (async () => {
      try {
        const info = await api.get<{ devMode: boolean }>('/auth/wechat/url', { skipAuth: true });
        setDevMode(info.devMode);
      } catch {
        // 探测失败（网络抖动 / 限流）时容错回退到开发模式：
        // 本地开发可正常登录；生产环境 dev-login 端点有 isDevMode 保护，会拒绝请求，不会暴露风险。
        setDevMode(true);
      }
      try {
        const refreshed = await api.post<TokenResponse>('/auth/refresh', undefined, { skipAuth: true });
        applyTokens(refreshed);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [applyTokens]);

  const loginDev = useCallback(
    async (openid?: string) => {
      const data = await api.post<TokenResponse>('/auth/dev-login', { openid }, { skipAuth: true });
      applyTokens(data);
    },
    [applyTokens],
  );

  const loginByCode = useCallback(
    async (code: string, state?: string) => {
      const data = await api.post<TokenResponse>('/auth/login-by-code', { code, state }, { skipAuth: true });
      applyTokens(data);
    },
    [applyTokens],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { skipAuth: true });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) return;
    const me = await api.get<PublicUser>('/auth/me');
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, devMode, loginDev, loginByCode, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
