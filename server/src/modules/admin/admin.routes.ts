import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './admin.controller.js';
import { listQuerySchema } from '../locations/locations.schema.js';
import { createAccountSchema, resetPasswordSchema } from '../auth/auth.schema.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/employees', asyncHandler(ctrl.employees));
adminRouter.get('/locations', validate(listQuerySchema, 'query'), asyncHandler(ctrl.locations));
adminRouter.post('/accounts', validate(createAccountSchema), asyncHandler(ctrl.createAccount));
adminRouter.post('/accounts/:id/bind', validate(createAccountSchema), asyncHandler(ctrl.bindAccount));
adminRouter.post('/accounts/:id/password', validate(resetPasswordSchema), asyncHandler(ctrl.resetAccountPassword));
