import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { authLimiter } from '../../middleware/rateLimiters';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as c from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(c.login));
authRouter.post('/refresh', validate({ body: refreshSchema }), asyncHandler(c.refresh));
authRouter.post('/logout', validate({ body: refreshSchema }), asyncHandler(c.logout));
authRouter.post('/logout-all', authenticate, asyncHandler(c.logoutAll));
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(c.changePassword),
);
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(c.forgotPassword),
);
authRouter.get('/me', authenticate, asyncHandler(c.me));
