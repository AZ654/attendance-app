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

/** 访问令牌只存内存，永不落 localStorage/sessionStorage；刷新令牌由 httpOnly Cookie 承载。 */
let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
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
}

/** 尝试用 httpOnly Cookie 刷新访问令牌（单例，避免并发重放）。 */
async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as TokenResponse;
      setAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
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
  };
  if (map[shape.code]) return map[shape.code];
  if (shape.details?.length) {
    return `${shape.message}：${shape.details.map((d) => d.message).join('、')}`;
  }
  return shape.message || '操作失败，请重试';
}

/** 统一请求封装：401 自动刷新重试；5xx/网络错误最多重试 3 次；4xx 不重试。 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, retries = 2, headers, ...rest } = options;
  const doFetch = async (): Promise<Response> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...(headers ?? {}) };
    if (!skipAuth && accessToken) h['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`${BASE}${path}`, { ...rest, headers: h, credentials: 'include' });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch {
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
      setAccessToken(null);
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
