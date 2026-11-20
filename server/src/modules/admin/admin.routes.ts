import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './admin.controller.js';
import { listQuerySchema } from '../locations/locations.schema.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/employees', asyncHandler(ctrl.employees));
adminRouter.get('/locations', validate(listQuerySchema, 'query'), asyncHandler(ctrl.locations));
