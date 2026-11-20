import type { Request, Response } from 'express';
import { config } from '../config/env.js';

export const REFRESH_COOKIE = 'rt';
export const OAUTH_STATE_COOKIE = 'wx_state';

/** 设置刷新令牌 httpOnly Cookie（前端 JS 不可读，防 XSS 窃取）。 */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

/** OAuth state 写入 httpOnly Cookie，回调时比对防 CSRF；10 分钟有效。 */
export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth' });
}

/** 手动解析 Cookie 头，避免额外依赖。 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
