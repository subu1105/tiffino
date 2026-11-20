import { z } from 'zod';
import { businessDateSchema, objectIdSchema } from './common';

/** Log a generated customer statement. The server recomputes every number
 *  itself so the stored record is authoritative, not client-supplied. */
export const createStatementSchema = z
  .object({
    customerId: objectIdSchema,
    periodLabel: z.string().trim().min(1).max(60),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .strict()
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: 'from must be on or before to',
    path: ['from'],
  });
export type CreateStatementInput = z.infer<typeof createStatementSchema>;

export const statementsListQuerySchema = z.object({
  /** Omit to list recent statements across ALL customers. */
  customerId: objectIdSchema.optional(),
});
export type StatementsListQuery = z.infer<typeof statementsListQuerySchema>;
