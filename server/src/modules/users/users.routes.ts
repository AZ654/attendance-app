import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../lib/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './users.controller.js';
import { savePhoneSchema, saveRealnameSchema } from './users.schema.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/me/profile', asyncHandler(ctrl.getProfile));
usersRouter.get('/purpose', asyncHandler(ctrl.purposeNotice));
usersRouter.post('/me/phone', validate(savePhoneSchema), asyncHandler(ctrl.savePhone));
usersRouter.post('/me/realname', validate(saveRealnameSchema), asyncHandler(ctrl.saveRealname));
usersRouter.delete('/me/phone', asyncHandler(ctrl.clearPhone));
usersRouter.delete('/me/realname', asyncHandler(ctrl.clearRealname));
