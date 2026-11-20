import type { RequestHandler } from 'express';
import { logger } from '../../lib/logger.js';
import * as service from './consent.service.js';

export const getNotice: RequestHandler = (_req, res) => {
  res.json(service.consentNotice());
};

export const getMine: RequestHandler = (req, res) => {
  res.json({ consent: service.getMyConsent(req.auth!.sub) });
};

export const getHistory: RequestHandler = (req, res) => {
  res.json({ items: service.getConsentHistory(req.auth!.sub) });
};

export const grant: RequestHandler = (req, res) => {
  const { acknowledged } = req.body as { acknowledged?: boolean };
  const view = service.grantConsent(req.auth!.sub, acknowledged === true);
  logger.info({ userId: req.auth!.sub, consentId: view.id }, '位置采集授权已授予');
  res.json(view);
};

export const revoke: RequestHandler = (req, res) => {
  const result = service.revokeConsent(req.auth!.sub);
  logger.info({ userId: req.auth!.sub, revoked: result.revoked }, '位置采集授权已撤回');
  res.json(result);
};
