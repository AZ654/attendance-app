import type { RequestHandler } from 'express';
import { logger } from '../../lib/logger.js';
import * as service from './users.service.js';

export const getProfile: RequestHandler = (req, res) => {
  res.json(service.getProfileView(req.auth!.sub));
};

export const savePhone: RequestHandler = (req, res) => {
  const { phone, code, consent } = req.body as { phone: string; code: string; consent: boolean };
  const view = service.savePhone(req.auth!.sub, phone, code, consent);
  logger.info({ userId: req.auth!.sub }, '手机号已保存（短信验证码核验通过）');
  res.json(view);
};

export const saveRealname: RequestHandler = (req, res) => {
  const { realName, idCard, consent } = req.body as {
    realName: string; idCard: string; consent: boolean;
  };
  const view = service.saveRealname(req.auth!.sub, realName, idCard, consent);
  logger.info({ userId: req.auth!.sub }, '实名信息已保存');
  res.json(view);
};

export const clearPhone: RequestHandler = (req, res) => {
  res.json(service.clearPhone(req.auth!.sub));
};

export const clearRealname: RequestHandler = (req, res) => {
  res.json(service.clearRealname(req.auth!.sub));
};

/** 用途告知文案（前端展示用，明确告知收集目的）。 */
export const purposeNotice: RequestHandler = (_req, res) => {
  res.json({
    phone: '手机号仅用于考勤异常时联系本人，加密存储、脱敏展示，可随时撤回。',
    realname: '实名信息仅用于考勤记录归属核对，身份证号加密存储且仅脱敏展示，可随时删除。',
    note: '网页微信登录无法直接读取微信绑定手机号；此处为本人自愿填写，非自动获取。',
  });
};
