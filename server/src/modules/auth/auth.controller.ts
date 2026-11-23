import type { RequestHandler } from 'express';
import { config } from '../../config/env.js';
import { BadRequestError, UnauthorizedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { setRefreshCookie, clearRefreshCookie, readCookie } from '../../lib/cookies.js';
import { issueOAuthState, getOAuthStateSession, verifyOAuthState as checkOAuthState } from '../../lib/oauth-state.js';
import * as service from './auth.service.js';
import { authRepository } from './auth.repository.js';
import { qrSessionRepository } from './qr-session.repository.js';
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
    return res.json({ devMode: true, authUrl: null, passwordLoginEnabled: config.passwordLoginEnabled });
  }
  if (!config.WECHAT_APP_ID || !config.WECHAT_REDIRECT_URI) {
    // 没有微信凭证时仍允许电脑端账号登录；前端据此隐藏微信按钮
    return res.json({ devMode: false, authUrl: null, wechatConfigured: false, passwordLoginEnabled: config.passwordLoginEnabled });
  }
  // 自签名 state：微信会原样带回，后端验签即可，不依赖第三方 Cookie（微信内置浏览器会阻止跨站 Cookie）
  const state = issueOAuthState(config.JWT_ACCESS_SECRET);
  res.json({ devMode: false, authUrl: buildWechatAuthUrl(state), state, wechatConfigured: true, passwordLoginEnabled: config.passwordLoginEnabled });
};

const QR_SESSION_TTL_MS = 5 * 60 * 1000;

/** 电脑扫码登录：创建一次性会话，返回带会话 ID 的微信授权地址供前端生成二维码。 */
export const createQrSession: RequestHandler = (_req, res) => {
  if (config.isDevMode || !config.WECHAT_APP_ID || !config.WECHAT_REDIRECT_URI) {
    throw new UnauthorizedError('服务端未配置微信扫码登录');
  }
  const now = Date.now();
  const session = qrSessionRepository.create(now, QR_SESSION_TTL_MS);
  const state = issueOAuthState(config.JWT_ACCESS_SECRET, now, session.id);
  res.json({
    sessionId: session.id,
    authUrl: buildWechatAuthUrl(state),
    expiresIn: Math.floor(QR_SESSION_TTL_MS / 1000),
  });
};

/** 电脑扫码登录：轮询会话状态，登录成功后为电脑端设置刷新 Cookie 并返回令牌。 */
export const qrSessionStatus: RequestHandler = (req, res) => {
  const sessionId = req.query.sessionId;
  if (typeof sessionId !== 'string') throw new BadRequestError('缺少 sessionId');
  const now = Date.now();
  const row = qrSessionRepository.find(sessionId);
  if (!row || row.expires_at <= now || row.status === 'expired') {
    if (row && row.status === 'pending') qrSessionRepository.markExpired(sessionId, now);
    return res.json({ status: 'expired' });
  }
  if (row.status === 'logged_in' && row.access_token && row.refresh_token && row.user_json) {
    setRefreshCookie(res, row.refresh_token);
    return res.json({
      status: 'logged_in',
      accessToken: row.access_token,
      user: JSON.parse(row.user_json),
    });
  }
  res.json({ status: 'pending' });
};

/** 电脑端账号密码登录，返回与微信登录相同的令牌结构。 */
export const passwordLogin: RequestHandler = (req, res) => {
  if (!config.passwordLoginEnabled) throw new UnauthorizedError('账号密码登录已关闭');
  const { username, password } = req.body as { username: string; password: string };
  const tokens = service.loginWithPassword(username, password);
  logger.info({ userId: tokens.user.id, username }, '电脑端账号登录');
  sendTokens(res, tokens);
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

/** 校验 OAuth state：验证自签名令牌（含时间戳防重放），防 CSRF，不依赖 Cookie。 */
function assertOAuthState(state: unknown): void {
  if (!checkOAuthState(state, config.JWT_ACCESS_SECRET)) {
    throw new UnauthorizedError('登录状态校验失败，请重新发起微信登录');
  }
}

/** 微信 OAuth 后端回调（备用路径）：校验 state 后用 code 换 openid 登录。 */
export const wechatCallback: RequestHandler = async (req, res) => {
  const code = req.query.code;
  if (typeof code !== 'string' || !code) throw new BadRequestError('缺少微信授权 code');
  assertOAuthState(req.query.state);
  const identity = await service.exchangeCodeForIdentity(code);
  sendTokens(res, service.loginWithWechatIdentity(identity));
};

/** 用 code 直接登录（前端拿到 code 后调用，返回令牌对）。 */
export const loginByCode: RequestHandler = async (req, res) => {
  const { code, state } = req.body as { code: string; state?: string };
  if (!code) throw new BadRequestError('缺少 code');
  // 真实 OAuth 流程必须校验 state；开发模式用模拟身份，不走此路径。
  if (!config.isDevMode) assertOAuthState(state);
  const identity = await service.exchangeCodeForIdentity(code);
  const tokens = service.loginWithWechatIdentity(identity);

  // 扫码桥接：state 中带电脑会话 ID 时，为电脑端单独签发令牌并标记会话已登录
  const sessionId = getOAuthStateSession(state, config.JWT_ACCESS_SECRET);
  if (sessionId) {
    const user = authRepository.findUserById(tokens.user.id);
    if (user) {
      const desktopTokens = service.issueTokens(user);
      qrSessionRepository.markLoggedIn(sessionId, desktopTokens, Date.now());
    }
  }

  sendTokens(res, tokens);
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
