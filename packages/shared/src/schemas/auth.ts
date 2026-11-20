import { z } from 'zod';
import { passwordSchema } from './common';

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z
  .object({
    // Mobile sends the token in the body; web relies on the httpOnly cookie.
    refreshToken: z.string().min(1).optional(),
  })
  .strict();
export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
  })
  .strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
