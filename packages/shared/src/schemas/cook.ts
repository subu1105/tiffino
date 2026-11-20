import { z } from 'zod';
import { businessDateSchema } from './common';

export const COOK_ENTRY_KINDS = ['paid', 'return'] as const;
export type CookEntryKind = (typeof COOK_ENTRY_KINDS)[number];

/** One line of the cook ledger: money given to the cook, or returned by them. */
export const createCookEntrySchema = z
  .object({
    entryDate: businessDateSchema,
    kind: z.enum(COOK_ENTRY_KINDS),
    amount: z.number().int().min(1).max(1000000),
    notes: z.string().trim().max(300).default(''),
  })
  .strict();
export type CreateCookEntryInput = z.infer<typeof createCookEntrySchema>;

export const cookLedgerQuerySchema = z
  .object({
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: 'from must be on or before to',
    path: ['from'],
  });
export type CookLedgerQuery = z.infer<typeof cookLedgerQuerySchema>;

export const COOK_ATTENDANCE_STATUSES = ['worked', 'half-day', 'leave'] as const;
export type CookAttendanceStatus = (typeof COOK_ATTENDANCE_STATUSES)[number];

/** Mark (or re-mark) one day: worked carries that day's wage snapshot. */
export const markCookAttendanceSchema = z
  .object({
    date: businessDateSchema,
    status: z.enum(COOK_ATTENDANCE_STATUSES),
    /** The wage counted for this day (half-day sends the halved amount).
     *  Required unless the day is leave. Flows into profit & loss. */
    dailyRate: z.number().int().min(1).max(100000).optional(),
  })
  .strict()
  .refine((v) => v.status === 'leave' || v.dailyRate !== undefined, {
    message: 'dailyRate is required unless the day is leave',
    path: ['dailyRate'],
  });
export type MarkCookAttendanceInput = z.infer<typeof markCookAttendanceSchema>;
