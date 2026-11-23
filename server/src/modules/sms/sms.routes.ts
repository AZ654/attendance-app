import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './sms.controller.js';
import { sendCodeSchema } from './sms.schema.js';

export const smsRouter = Router();
smsRouter.use(requireAuth);

// 发送验证码限流：同一 IP 15 分钟最多 10 次，避免短信轰炸（服务商）+ 滥用
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: '验证码发送过于频繁，请稍后再试' } },
});

smsRouter.post('/send-code', sendLimiter, validate(sendCodeSchema), asyncHandler(ctrl.sendCode));
