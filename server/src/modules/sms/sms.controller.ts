import type { RequestHandler } from 'express';
import * as service from './sms.service.js';

/** 发送手机号绑定验证码（需登录）。 */
export const sendCode: RequestHandler = async (req, res) => {
  const { phone } = req.body as { phone: string };
  const result = await service.sendCode(phone);
  res.json(result);
};
