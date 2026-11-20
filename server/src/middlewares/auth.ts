import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/token.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import type { AccessTokenPayload } from '../lib/token.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

/** JWT 访问令牌认证中间件。令牌只从 Authorization: Bearer 读取，禁止放 URL 参数。 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('缺少访问令牌'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new UnauthorizedError('访问令牌无效或已过期'));
  }
};

/** RBAC 角色守卫。 */
export function requireRole(...roles: Array<'employee' | 'admin'>): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new UnauthorizedError());
    if (!roles.includes(req.auth.role)) return next(new ForbiddenError('需要更高权限'));
    next();
  };
}
