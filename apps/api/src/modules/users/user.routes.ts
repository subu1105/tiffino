import { Router, type Request, type Response } from 'express';
import {
  createStaffSchema,
  idParamsSchema,
  resetStaffPasswordSchema,
  updateUserSchema,
  userStatusSchema,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireOwner } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created } from '../../utils/respond';
import * as userService from './user.service';

export const userRouter = Router();

userRouter.use(authenticate, requireOwner);

userRouter.post(
  '/staff',
  validate({ body: createStaffSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    created(res, await userService.createStaff(req.body, req.user!));
  }),
);

userRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await userService.listUsers());
  }),
);

userRouter.put(
  '/:id',
  validate({ params: idParamsSchema, body: updateUserSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await userService.updateUser(req.params.id as string, req.body, req.user!));
  }),
);

userRouter.patch(
  '/:id/status',
  validate({ params: idParamsSchema, body: userStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await userService.setUserStatus(req.params.id as string, req.body.status, req.user!));
  }),
);

userRouter.patch(
  '/:id/password',
  validate({ params: idParamsSchema, body: resetStaffPasswordSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await userService.resetStaffPassword(req.params.id as string, req.body.newPassword, req.user!);
    ok(res, { message: 'Password reset. The staff member must log in again.' });
  }),
);
