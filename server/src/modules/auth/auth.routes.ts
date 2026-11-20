import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './auth.controller.js';
import { devLoginSchema, loginByCodeSchema, passwordLoginSchema } from './auth.schema.js';

export const authRouter = Router();

// 密码登录单独限流：只统计失败请求（成功登录不占用额度）
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: '密码错误次数过多，请稍后再试' } },
});

// 公开端点
authRouter.get('/wechat/url', asyncHandler(ctrl.getWechatAuthUrl));
authRouter.get('/wechat/callback', asyncHandler(ctrl.wechatCallback));
authRouter.post('/dev-login', validate(devLoginSchema), asyncHandler(ctrl.devLogin));
authRouter.post('/password-login', passwordLimiter, validate(passwordLoginSchema), asyncHandler(ctrl.passwordLogin));
authRouter.post('/login-by-code', validate(loginByCodeSchema), asyncHandler(ctrl.loginByCode));
authRouter.post('/refresh', asyncHandler(ctrl.refresh));
authRouter.post('/logout', asyncHandler(ctrl.logout));

// 受保护端点
authRouter.get('/me', requireAuth, asyncHandler(ctrl.me));
