import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../../config/env.js';
import { BadRequestError, UnauthorizedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  setRefreshCookie, clearRefreshCookie, readCookie,
  setOAuthStateCookie, clearOAuthStateCookie, OAUTH_STATE_COOKIE,
} from '../../lib/cookies.js';
import * as service from './auth.service.js';
import { authRepository } from './auth.repository.js';
import type { TokenPair } from './auth.service.js';

/** 把令牌对中的刷新令牌写入 httpOnly Cookie，响应体只返回访问令牌与用户信息。 */
function sendTokens(res: import('express').Response, tokens: TokenPair): void {
  setRefreshCookie(res, tokens.refreshToken);
  res.json({
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    user: tokens.user,
  });
}

/** 生成微信网页 OAuth 授权 URL，前端据此跳转。 */
export const getWechatAuthUrl: RequestHandler = (req, res) => {
  if (config.isDevMode) {
    return res.json({ devMode: true, authUrl: null });
  }
  if (!config.WECHAT_APP_ID || !config.WECHAT_REDIRECT_URI) {
    throw new BadRequestError('服务端未配置微信登录');
  }
  const state = randomUUID();
  setOAuthStateCookie(res, state);
  res.json({ devMode: false, authUrl: buildWechatAuthUrl(state), state });
};

function buildWechatAuthUrl(state: string): string {
  const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize');
  url.searchParams.set('appid', config.WECHAT_APP_ID);
  url.searchParams.set('redirect_uri', config.WECHAT_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'snsapi_userinfo');
  url.searchParams.set('state', state);
  return `${url.toString()}#wechat_redirect`;
}

/** 开发模式登录：无需真实微信，便于本地联调。生产环境该接口不可用。 */
export const devLogin: RequestHandler = (req, res) => {
  if (!config.isDevMode) throw new UnauthorizedError('开发登录已关闭');
  const { openid, nickname } = req.body as { openid?: string; nickname?: string };
  const tokens = service.loginWithWechatIdentity({
    openid: openid ?? config.AUTH_DEV_OPENID,
    nickname: nickname ?? '演示员工',
    avatar: null,
  });
  logger.info({ openid, userId: tokens.user.id }, '开发模式登录');
  sendTokens(res, tokens);
};

/** 校验 OAuth state：与 httpOnly Cookie 中的值严格比对，防 CSRF。 */
function verifyOAuthState(req: import('express').Request, state: unknown): void {
  const expected = readCookie(req, OAUTH_STATE_COOKIE);
  if (typeof state !== 'string' || !state || !expected || state !== expected) {
    throw new UnauthorizedError('登录状态校验失败，请重新发起微信登录');
  }
}

/** 微信 OAuth 后端回调（备用路径）：校验 state 后用 code 换 openid 登录。 */
export const wechatCallback: RequestHandler = async (req, res) => {
  const code = req.query.code;
  if (typeof code !== 'string' || !code) throw new BadRequestError('缺少微信授权 code');
  verifyOAuthState(req, req.query.state);
  const identity = await service.exchangeCodeForIdentity(code);
  clearOAuthStateCookie(res);
  sendTokens(res, service.loginWithWechatIdentity(identity));
};

/** 用 code 直接登录（前端拿到 code 后调用，返回令牌对）。 */
export const loginByCode: RequestHandler = async (req, res) => {
  const { code, state } = req.body as { code: string; state?: string };
  if (!code) throw new BadRequestError('缺少 code');
  // 真实 OAuth 流程必须校验 state；开发模式用模拟身份，不走此路径。
  if (!config.isDevMode) verifyOAuthState(req, state);
  const identity = await service.exchangeCodeForIdentity(code);
  clearOAuthStateCookie(res);
  sendTokens(res, service.loginWithWechatIdentity(identity));
};

/** 刷新访问令牌：从 httpOnly Cookie 读取刷新令牌并轮换。 */
export const refresh: RequestHandler = (req, res) => {
  const token = readCookie(req, 'rt');
  if (!token) throw new UnauthorizedError('缺少刷新令牌');
  sendTokens(res, service.rotateRefreshToken(token));
};

export const logout: RequestHandler = (req, res) => {
  const token = readCookie(req, 'rt');
  if (token) service.logoutRefreshToken(token);
  clearRefreshCookie(res);
  res.json({ success: true });
};

/** 获取当前登录账号信息。 */
export const me: RequestHandler = (req, res) => {
  const user = authRepository.findUserById(req.auth!.sub);
  if (!user) throw new UnauthorizedError('用户不存在');
  res.json(service.toPublicUser(user));
};
