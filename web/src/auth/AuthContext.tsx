import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ProfileView, PublicUser, TokenResponse } from '../types';
import { api, setAccessToken, getAccessToken } from '../api/client';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  devMode: boolean | null;
  passwordLoginEnabled: boolean;
  wechatConfigured: boolean;
  needPhoneBind: boolean;
  dismissPhoneBind: () => void;
  requirePhoneBind: () => Promise<void>;
  loginDev: (openid?: string) => Promise<void>;
  loginPassword: (username: string, password: string) => Promise<void>;
  loginByCode: (code: string, state?: string) => Promise<void>;
  startQrLogin: () => Promise<{ state: string; authUrl: string; expiresIn: number }>;
  checkQrLogin: (state: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [passwordLoginEnabled, setPasswordLoginEnabled] = useState(true);
  const [wechatConfigured, setWechatConfigured] = useState(true);
  const [needPhoneBind, setNeedPhoneBind] = useState(false);

  /** 仅手机号绑定成功后调用，用于解除主界面拦截。 */
  const dismissPhoneBind = useCallback(() => setNeedPhoneBind(false), []);

  /**
   * 微信账号必须绑定手机号后才可进入主界面。
   * 以 openid 是否以 local: 开头区分：微信/开发登录为微信身份，密码登录为本地账号
   * （管理员走密码登录，不受此限制，否则后台无法进入）。
   * 该判断基于服务端返回的用户信息，刷新页面、恢复会话后依然生效。
   */
  const enforcePhoneBind = useCallback(async (u: PublicUser) => {
    if (!u || u.openid.startsWith('local:')) {
      setNeedPhoneBind(false);
      return;
    }
    // 先同步拦截，避免校验期间闪现主界面
    setNeedPhoneBind(true);
    try {
      const profile = await api.get<ProfileView>('/users/me/profile');
      setNeedPhoneBind(!profile.hasPhone);
    } catch {
      // 查询失败（网络抖动/限流）时放行，避免已绑定用户被卡死；下次进入重新校验
      setNeedPhoneBind(false);
    }
  }, []);

  const applyTokens = useCallback((data: TokenResponse) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  // 初始化：查询是否为开发模式，并尝试用 Cookie 静默恢复登录态
  useEffect(() => {
    (async () => {
      try {
        const info = await api.get<{
          devMode: boolean;
          wechatConfigured?: boolean;
          passwordLoginEnabled?: boolean;
        }>('/auth/wechat/url', { skipAuth: true });
        setDevMode(info.devMode);
        setWechatConfigured(info.wechatConfigured !== false);
        setPasswordLoginEnabled(info.passwordLoginEnabled !== false);
      } catch {
        // 探测失败（网络抖动 / 限流）时容错回退到开发模式：
        // 本地开发可正常登录；生产环境 dev-login 端点有 isDevMode 保护，会拒绝请求，不会暴露风险。
        setDevMode(true);
        setWechatConfigured(false);
      }
      try {
        const refreshed = await api.post<TokenResponse>('/auth/refresh', undefined, { skipAuth: true });
        applyTokens(refreshed);
        // 刷新恢复会话时同样要拦截未绑手机号的微信用户，防止刷新页面绕过
        await enforcePhoneBind(refreshed.user);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [applyTokens, enforcePhoneBind]);

  const loginDev = useCallback(
    async (openid?: string) => {
      const data = await api.post<TokenResponse>('/auth/dev-login', { openid }, { skipAuth: true });
      applyTokens(data);
      await enforcePhoneBind(data.user);
    },
    [applyTokens, enforcePhoneBind],
  );

  const loginPassword = useCallback(
    async (username: string, password: string) => {
      const data = await api.post<TokenResponse>('/auth/password-login', { username, password }, { skipAuth: true });
      applyTokens(data);
      // 本地账号（管理员）走密码登录，不强制绑定手机号
      await enforcePhoneBind(data.user);
    },
    [applyTokens, enforcePhoneBind],
  );

  const loginByCode = useCallback(
    async (code: string, state?: string) => {
      const data = await api.post<TokenResponse>('/auth/login-by-code', { code, state }, { skipAuth: true });
      applyTokens(data);
      await enforcePhoneBind(data.user);
    },
    [applyTokens, enforcePhoneBind],
  );

  const startQrLogin = useCallback(
    async () => api.post<{ state: string; authUrl: string; expiresIn: number }>('/auth/qr-session', undefined, { skipAuth: true }),
    [],
  );

  const checkQrLogin = useCallback(
    async (state: string) => {
      const data = await api.get<TokenResponse | { status: string }>(
        `/auth/qr-status?state=${encodeURIComponent(state)}`,
        { skipAuth: true, retries: 0 },
      );
      if ('accessToken' in data) {
        applyTokens(data);
        await enforcePhoneBind(data.user);
        return true;
      }
      return false;
    },
    [applyTokens, enforcePhoneBind],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { skipAuth: true });
    } finally {
      setAccessToken(null);
      setUser(null);
      setNeedPhoneBind(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) return;
    const me = await api.get<PublicUser>('/auth/me');
    setUser(me);
  }, []);

  /** 主动重新校验手机号绑定状态（如用户在「我的」页删除手机号后）。 */
  const requirePhoneBind = useCallback(async () => {
    if (user) await enforcePhoneBind(user);
  }, [user, enforcePhoneBind]);

  return (
    <AuthContext.Provider
      value={{
        user, loading, devMode, passwordLoginEnabled, wechatConfigured, needPhoneBind, dismissPhoneBind, requirePhoneBind,
        loginDev, loginPassword, loginByCode, startQrLogin, checkQrLogin, logout, refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
