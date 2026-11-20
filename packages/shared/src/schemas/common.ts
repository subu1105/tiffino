import { z } from 'zod';
import { isValidBusinessDate } from '../dates';

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const businessDateSchema = z
  .string()
  .refine(isValidBusinessDate, 'Date must be a valid YYYY-MM-DD date');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Password policy for new/changed passwords (login accepts anything non-empty). */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const idParamsSchema = z.object({ id: objectIdSchema });

/** Indian mobile number: 10 digits starting 6-9, optional +91/91/0 prefix normalised away. */
export const mobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'));
