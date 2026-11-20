import { z } from 'zod';
import { PAYMENT_METHODS } from '../constants';
import { businessDateSchema, objectIdSchema, paginationQuerySchema } from './common';

export const createPaymentSchema = z
  .object({
    customerId: objectIdSchema,
    amount: z.number().int().min(1).max(1000000),
    paymentDate: businessDateSchema,
    method: z.enum(PAYMENT_METHODS),
    notes: z.string().trim().max(300).default(''),
    /** Settle this payment against one specific statement (optional). */
    statementId: objectIdSchema.optional(),
  })
  .strict();
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const paymentsListQuerySchema = paginationQuerySchema.extend({
  customerId: objectIdSchema.optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
});
export type PaymentsListQuery = z.infer<typeof paymentsListQuerySchema>;
