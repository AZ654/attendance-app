import type { ApiErrorShape, TokenResponse } from '../types';

/**
 * API 基地址，按优先级：
 * 1. 运行时 config.js（window.__APP_CONFIG__.apiBase）——部署后改一个文件即可切换后端，无需重建
 * 2. 构建期 VITE_API_BASE（兼容旧部署方式）
 * 3. 本地开发走 Vite 代理的 /api
 */
declare global {
  interface Window {
    __APP_CONFIG__?: { apiBase?: string };
  }
}

const runtime = typeof window !== 'undefined' ? window.__APP_CONFIG__?.apiBase?.trim() : undefined;
const injected = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
const BASE = (runtime || injected || '/api').replace(/\/$/, '');

/** 访问令牌只存内存；续期令牌落 localStorage，供页面重开后静默恢复登录态。 */
let accessToken: string | null = null;
let refreshPromise: Promise<TokenResponse | null> | null = null;

const RT_KEY = 'attendance_refresh_token';

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

/** 持久化续期令牌。微信浏览器会阻止第三方 Cookie，必须靠 localStorage 才能跨页面续期。 */
export function setRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(RT_KEY, token);
    else localStorage.removeItem(RT_KEY);
  } catch { /* 隐私模式忽略 */ }
}
export function getRefreshToken(): string | null {
  try { return localStorage.getItem(RT_KEY); } catch { return null; }
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly shape: ApiErrorShape,
  ) {
    super(shape.message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  skipAuth?: boolean;
  retries?: number;
  timeout?: number;
}

/**
 * 尝试续期：优先用 localStorage 里的 refreshToken（通过请求体发送，绕开第三方 Cookie 限制），
 * 兼容旧版仅靠 httpOnly Cookie 的场景。单例避免并发重放导致令牌被吊销。
 * 成功后后端会轮换出新 refreshToken，一并更新到 localStorage。
 */
export async function tryRefresh(): Promise<TokenResponse | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const rt = getRefreshToken();
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rt ? { refreshToken: rt } : {}),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as TokenResponse;
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return data;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** 把后端错误映射为可读文案。 */
function friendlyMessage(shape: ApiErrorShape): string {
  const map: Record<string, string> = {
    UNAUTHORIZED: '登录状态已失效，请重新登录',
    FORBIDDEN: '没有权限执行此操作',
    CONSENT_REQUIRED: '需要先完成位置采集授权',
    NOT_FOUND: '请求的资源不存在',
    RATE_LIMITED: '操作过于频繁，请稍后再试',
    TOO_MANY_REQUESTS: '操作过于频繁，请稍后再试',
    TIMEOUT: '连接服务器超时，请检查手机网络后重试（切换 WiFi/流量 或 稍后再试）',
  };
  if (map[shape.code]) return map[shape.code];
  if (shape.details?.length) {
    return `${shape.message}：${shape.details.map((d) => d.message).join('、')}`;
  }
  return shape.message || '操作失败，请重试';
}

/** 统一请求封装：401 自动刷新重试；5xx/网络错误最多重试 3 次；4xx 不重试。 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, retries = 2, headers, timeout = 12000, ...rest } = options;
  const doFetch = async (): Promise<Response> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...(headers ?? {}) };
    if (!skipAuth && accessToken) h['Authorization'] = `Bearer ${accessToken}`;
    // 微信内置浏览器在弱网下 fetch 可能一直挂起（既不 resolve 也不 reject）。
    // 用 AbortController 加超时，避免按钮永远卡在「登录中...」且不给任何提示。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(`${BASE}${path}`, { ...rest, headers: h, credentials: 'include', signal: controller.signal });
    } catch (e) {
      if (e && (e as Error).name === 'AbortError') {
        throw new ApiClientError(0, { code: 'TIMEOUT', message: '连接服务器超时，请检查手机网络后重试' });
      }
      throw new ApiClientError(0, { code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络后重试' });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (e) {
    if (e instanceof ApiClientError) throw e;
    throw new ApiClientError(0, { code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络后重试' });
  }

  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      try {
        res = await doFetch();
      } catch {
        throw new ApiClientError(0, { code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络后重试' });
      }
    } else {
      // 续期令牌已失效/被吊销，清除本地存储避免反复用坏令牌请求
      setAccessToken(null);
      setRefreshToken(null);
      throw new ApiClientError(401, { code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' });
    }
  }

  if (res.status >= 500 && retries > 0) {
    await new Promise((r) => setTimeout(r, 400 * (3 - retries + 1)));
    return request<T>(path, { ...options, retries: retries - 1 });
  }

  if (!res.ok) {
    let shape: ApiErrorShape = { code: 'UNKNOWN', message: `请求失败 (${res.status})` };
    try {
      const body = (await res.json()) as { error?: ApiErrorShape };
      if (body.error) shape = body.error;
    } catch { /* ignore */ }
    throw new ApiClientError(res.status, { ...shape, message: friendlyMessage(shape) });
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
};
