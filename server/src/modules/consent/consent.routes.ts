import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './consent.controller.js';
import { grantConsentSchema } from './consent.schema.js';

export const consentRouter = Router();

consentRouter.get('/notice', asyncHandler(ctrl.getNotice));
consentRouter.use(requireAuth);
consentRouter.get('/mine', asyncHandler(ctrl.getMine));
consentRouter.get('/history', asyncHandler(ctrl.getHistory));
consentRouter.post('/grant', validate(grantConsentSchema), asyncHandler(ctrl.grant));
consentRouter.post('/revoke', asyncHandler(ctrl.revoke));
