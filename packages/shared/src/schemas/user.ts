import { z } from 'zod';
import { PERMISSIONS, USER_STATUSES } from '../constants';
import { passwordSchema } from './common';

const permissionEnum = z.enum(PERMISSIONS);

export const createStaffSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    password: passwordSchema,
    permissions: z.array(permissionEnum).max(PERMISSIONS.length).default([]),
  })
  .strict();
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    permissions: z.array(permissionEnum).max(PERMISSIONS.length).optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userStatusSchema = z
  .object({ status: z.enum(USER_STATUSES) })
  .strict();
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const resetStaffPasswordSchema = z
  .object({ newPassword: passwordSchema })
  .strict();
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;
