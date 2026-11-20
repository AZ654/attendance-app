import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './locations.controller.js';
import { reportLocationSchema, listQuerySchema } from './locations.schema.js';

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

locationsRouter.post('/report', validate(reportLocationSchema), asyncHandler(ctrl.report));
locationsRouter.get('/mine', validate(listQuerySchema, 'query'), asyncHandler(ctrl.listMine));
