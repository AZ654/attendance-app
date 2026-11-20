import { randomUUID } from 'node:crypto';
import { authRepository, type UserRow } from './auth.repository.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, type AccessTokenPayload } from '../../lib/token.js';
import { sha256, randomToken } from '../../lib/crypto.js';
import { config } from '../../config/env.js';
import { UnauthorizedError, BadRequestError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  role: 'employee' | 'admin';
  openid: string;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    role: u.role,
    openid: u.openid,
    nickname: u.nickname,
    avatar: u.avatar,
    createdAt: u.created_at,
  };
}

/** 用微信身份（openid）查找或创建用户，并签发令牌对。 */
export function loginWithWechatIdentity(input: {
  openid: string;
  unionid?: string | null;
  nickname?: string | null;
  avatar?: string | null;
}): TokenPair {
  let user = authRepository.findUserByOpenid(input.openid);
  if (!user) {
    const now = new Date().toISOString();
    const isFirst = authRepository.countUsers() === 0;
    user = authRepository.createUser({
      id: randomUUID(),
      openid: input.openid,
      unionid: input.unionid ?? null,
      // 首个用户设为管理员，便于演示管理功能；生产环境应由后台显式授权
      role: isFirst ? 'admin' : 'employee',
      nickname: input.nickname ?? null,
      avatar: input.avatar ?? null,
      created_at: now,
      updated_at: now,
    });
    logger.info({ userId: user.id, role: user.role }, '新用户创建');
  } else if (input.nickname || input.avatar) {
    authRepository.updateProfile(user.id, input.nickname ?? user.nickname, input.avatar ?? user.avatar);
    user = authRepository.findUserById(user.id)!;
  }

  return issueTokens(user);
}

export function issueTokens(user: UserRow): TokenPair {
  const payload: AccessTokenPayload = { sub: user.id, role: user.role, openid: user.openid };
  const accessToken = signAccessToken(payload);
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  const now = Date.now();

  authRepository.saveRefreshToken({
    jti,
    user_id: user.id,
    token_hash: sha256(refreshToken),
    expires_at: now + 7 * 24 * 3600 * 1000,
    revoked_at: null,
    created_at: now,
  });
  // 顺带清理过期令牌
  authRepository.purgeExpiredTokens(now);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60,
    user: toPublicUser(user),
  };
}

/** 刷新访问令牌：轮换刷新令牌（旧令牌立即吊销），防止重放。 */
export function rotateRefreshToken(refreshToken: string): TokenPair {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('刷新令牌无效或已过期');
  }

  const row = authRepository.findRefreshToken(payload.jti);
  if (!row) throw new UnauthorizedError('刷新令牌不存在');
  const now = Date.now();
  if (row.revoked_at !== null) {
    // 检测到重放：吊销该用户全部令牌
    authRepository.revokeAllRefreshForUser(row.user_id, now);
    logger.warn({ userId: row.user_id }, '检测到刷新令牌重放，已吊销全部令牌');
    throw new UnauthorizedError('刷新令牌已被使用，请重新登录');
  }
  if (row.expires_at < now) throw new UnauthorizedError('刷新令牌已过期');
  if (row.token_hash !== sha256(refreshToken)) throw new UnauthorizedError('刷新令牌校验失败');

  const user = authRepository.findUserById(payload.sub);
  if (!user) throw new UnauthorizedError('用户不存在');

  authRepository.revokeRefreshToken(payload.jti, now);
  return issueTokens(user);
}

export function logoutRefreshToken(refreshToken: string): void {
  try {
    const payload = verifyRefreshToken(refreshToken);
    authRepository.revokeRefreshToken(payload.jti, Date.now());
  } catch {
    // 登出时令牌无效也视为成功，避免信息泄露
  }
}

export interface WechatIdentity {
  openid: string;
  unionid?: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 用微信 code 换取身份（真实 OAuth）。
 * 1) code → access_token + openid（+ unionid，绑定开放平台账号时返回）
 * 2) scope=snsapi_userinfo 时，再用 access_token 拉取昵称/头像
 * 昵称头像拉取失败不影响登录，仅记为 null。
 */
export async function exchangeCodeForIdentity(code: string): Promise<WechatIdentity> {
  if (!config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET) {
    throw new BadRequestError('服务端未配置微信应用凭证');
  }
  const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  url.searchParams.set('appid', config.WECHAT_APP_ID);
  url.searchParams.set('secret', config.WECHAT_APP_SECRET);
  url.searchParams.set('code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`微信接口 HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    access_token?: string;
    openid?: string;
    unionid?: string;
    scope?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (data.errcode || !data.openid) {
    throw new UnauthorizedError(`微信登录失败: ${data.errmsg ?? '未知错误'}`);
  }

  const identity: WechatIdentity = { openid: data.openid, unionid: data.unionid };

  // 仅 snsapi_userinfo 授权可拉取昵称头像；失败不阻断登录
  if (data.access_token && data.scope?.includes('snsapi_userinfo')) {
    try {
      const uiUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
      uiUrl.searchParams.set('access_token', data.access_token);
      uiUrl.searchParams.set('openid', data.openid);
      uiUrl.searchParams.set('lang', 'zh_CN');
      const uiResp = await fetch(uiUrl.toString(), { signal: AbortSignal.timeout(8000) });
      if (uiResp.ok) {
        const ui = (await uiResp.json()) as {
          nickname?: string;
          headimgurl?: string;
          unionid?: string;
          errcode?: number;
        };
        if (!ui.errcode) {
          identity.nickname = ui.nickname;
          identity.avatar = ui.headimgurl;
          identity.unionid = ui.unionid ?? identity.unionid;
        }
      }
    } catch {
      logger.warn({ openid: data.openid }, '拉取微信昵称头像失败，忽略');
    }
  }

  return identity;
}
