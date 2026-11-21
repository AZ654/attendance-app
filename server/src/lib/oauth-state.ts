import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 无 Cookie 的 OAuth state（防 CSRF）。
 *
 * 微信网页授权会把 state 参数原样带回 redirect_uri。传统做法是把 state 写进
 * httpOnly Cookie 再比对，但微信内置浏览器会阻止第三方 Cookie（前端在
 * github.io、后端在 railway.app，属跨站），导致回调读不到 Cookie、登录失败。
 *
 * 改为自签名令牌：state = payload.signature，payload 含时间戳与随机数，
 * signature 用服务端密钥做 HMAC-SHA256。攻击者无法伪造（无密钥），
 * 且时间戳带有效期，可防重放。校验只依赖 state 本身，不依赖 Cookie。
 */

const TTL_MS = 10 * 60 * 1000;
/** 允许客户端与服务端时钟有小幅偏差。 */
const CLOCK_SKEW_MS = 60 * 1000;

export function issueOAuthState(secret: string, now: number = Date.now()): string {
  // base36 时间戳 + 8 字节随机数，整体保持短小（微信 state 有长度限制）
  const payload = `${now.toString(36)},${randomBytes(8).toString('base64url')}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: unknown, secret: string, now: number = Date.now()): boolean {
  if (typeof state !== 'string' || !state) return false;
  // 签名是 base64url，不含 '.'，用最后一个 '.' 分隔 payload 与签名
  const dot = state.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = state.slice(0, dot);
  const signature = state.slice(dot + 1);

  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  if (!timingSafeEqual(actual, expected)) return false;

  const [tsPart, nonce] = payload.split(',');
  if (!tsPart || !nonce) return false;
  const issuedAt = Number.parseInt(tsPart, 36);
  if (!Number.isFinite(issuedAt)) return false;
  const age = now - issuedAt;
  // 有效期内，或略微"未来"（时钟偏差）都可接受
  return age >= -CLOCK_SKEW_MS && age <= TTL_MS;
}
