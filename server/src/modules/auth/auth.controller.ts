import type { RequestHandler } from 'express';
import { config } from '../../config/env.js';
import { BadRequestError, UnauthorizedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { setRefreshCookie, clearRefreshCookie, readCookie } from '../../lib/cookies.js';
import { issueOAuthState, verifyOAuthState as checkOAuthState } from '../../lib/oauth-state.js';
import * as service from './auth.service.js';
import { authRepository } from './auth.repository.js';
import type { TokenPair, WechatIdentity } from './auth.service.js';

const QR_LOGIN_TTL_MS = 10 * 60 * 1000;

/**
 * 把刷新令牌写入 httpOnly Cookie，同时在响应体返回。
 * 响应体返回是为了让前端存入 localStorage：微信浏览器阻止第三方 Cookie，
 * 仅靠 Cookie 无法在页面重开后续期，必须给前端一份可持久化的续期令牌。
 */
function sendTokens(res: import('express').Response, tokens: TokenPair): void {
  setRefreshCookie(res, tokens.refreshToken);
  res.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: tokens.user,
  });
}

/** 续期令牌来源：优先请求体（前端 localStorage），兼容旧版 httpOnly Cookie。 */
function readRefreshToken(req: import('express').Request): string | undefined {
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  return readCookie(req, 'rt');
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

/** 电脑扫码登录：生成一次性 state 与二维码内容，手机微信扫码授权后电脑端轮询换取令牌。 */
export const startQrLogin: RequestHandler = (_req, res) => {
  if (config.isDevMode || !config.WECHAT_APP_ID || !config.WECHAT_REDIRECT_URI) {
    throw new BadRequestError('服务端未配置微信登录');
  }
  const now = Date.now();
  authRepository.purgeExpiredQrLoginSessions(now);
  const state = issueOAuthState(config.JWT_ACCESS_SECRET);
  authRepository.createQrLoginSession(state, now + QR_LOGIN_TTL_MS, now);
  res.json({ state, authUrl: buildWechatAuthUrl(state), expiresIn: QR_LOGIN_TTL_MS / 1000 });
};

/** 电脑端轮询扫码状态；授权完成后在当前浏览器写入刷新 Cookie 并返回令牌。 */
export const qrLoginStatus: RequestHandler = (req, res) => {
  const state = req.query.state;
  if (typeof state !== 'string' || !state) throw new BadRequestError('缺少登录会话 state');

  const identityJson = authRepository.consumeQrLoginSession(state);
  if (identityJson) {
    let identity: WechatIdentity;
    try {
      identity = JSON.parse(identityJson) as WechatIdentity;
    } catch {
      throw new BadRequestError('登录会话数据损坏，请重新扫码');
    }
    sendTokens(res, service.loginWithWechatIdentity(identity));
    return;
  }

  const session = authRepository.findQrLoginSession(state);
  if (!session || session.expiresAt <= Date.now()) {
    throw new BadRequestError('二维码已过期，请重新获取');
  }
  res.status(202).json({ status: session.status });
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

/** 用 code 完成微信授权：手机直接登录返回令牌；电脑扫码授权只回写会话，不登录手机。 */
export const loginByCode: RequestHandler = async (req, res) => {
  const { code, state } = req.body as { code: string; state?: string };
  if (!code) throw new BadRequestError('缺少 code');
  // 真实 OAuth 流程必须校验 state；开发模式用模拟身份，不走此路径。
  if (!config.isDevMode) assertOAuthState(state);
  const identity = await service.exchangeCodeForIdentity(code);

  // 区分两种回调：state 命中待授权的扫码会话 = 手机为电脑扫码授权；
  // 此时只把身份写回会话供电脑端轮询，不给手机签发令牌，手机端展示"授权成功"即可。
  if (state && typeof state === 'string') {
    const session = authRepository.findQrLoginSession(state);
    // 只要 state 对应扫码会话就按"为电脑授权"处理（重复回调也幂等，不会误登录手机）
    if (session) {
      authRepository.authorizeQrLoginSession(state, JSON.stringify(identity), Date.now());
      res.json({ qrAuthorized: true });
      return;
    }
  }

  // 手机端直接微信登录：正常签发令牌。
  const tokens = service.loginWithWechatIdentity(identity);
  sendTokens(res, tokens);
};

/** 刷新访问令牌：从 httpOnly Cookie 读取刷新令牌并轮换。 */
export const refresh: RequestHandler = (req, res) => {
  const token = readRefreshToken(req);
  if (!token) throw new UnauthorizedError('缺少刷新令牌');
  sendTokens(res, service.rotateRefreshToken(token));
};

export const logout: RequestHandler = (req, res) => {
  const token = readRefreshToken(req);
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
