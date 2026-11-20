import { z } from 'zod';
import { DASHBOARD_FILTERS } from '../constants';
import { businessDateSchema, paginationQuerySchema } from './common';

export const createExpenseSchema = z
  .object({
    expenseDate: businessDateSchema,
    item: z.string().trim().min(1, 'What was the expense for?').max(80),
    amount: z.number().int().min(1).max(1000000),
    notes: z.string().trim().max(300).default(''),
  })
  .strict();
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const expensesListQuerySchema = paginationQuerySchema.extend({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ExpensesListQuery = z.infer<typeof expensesListQuerySchema>;

/** Date-grouped expense book + CSV export share this range query. */
export const expenseRangeQuerySchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
  })
  .refine((v) => v.from <= v.to, { message: 'from must be on or before to', path: ['from'] });
export type ExpenseRangeQuery = z.infer<typeof expenseRangeQuerySchema>;

export const profitLossQuerySchema = z
  .object({
    filter: z.enum(DASHBOARD_FILTERS).optional(),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .refine((v) => Boolean(v.filter) || (Boolean(v.from) && Boolean(v.to)), {
    message: 'Provide either filter or from+to',
    path: ['filter'],
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: 'from must be on or before to',
    path: ['from'],
  });
export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;
