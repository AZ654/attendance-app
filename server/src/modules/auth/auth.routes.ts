import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './auth.controller.js';
import { devLoginSchema, loginByCodeSchema } from './auth.schema.js';

export const authRouter = Router();

// 公开端点
authRouter.get('/wechat/url', asyncHandler(ctrl.getWechatAuthUrl));
authRouter.get('/wechat/callback', asyncHandler(ctrl.wechatCallback));
authRouter.post('/dev-login', validate(devLoginSchema), asyncHandler(ctrl.devLogin));
authRouter.post('/login-by-code', validate(loginByCodeSchema), asyncHandler(ctrl.loginByCode));
authRouter.post('/refresh', asyncHandler(ctrl.refresh));
authRouter.post('/logout', asyncHandler(ctrl.logout));

// 受保护端点
authRouter.get('/me', requireAuth, asyncHandler(ctrl.me));
