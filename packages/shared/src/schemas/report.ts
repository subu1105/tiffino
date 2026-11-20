import { z } from 'zod';
import { CUSTOMER_TYPES, DASHBOARD_FILTERS, MEAL_TYPES, ORDER_STATUSES } from '../constants';
import { businessDateSchema, objectIdSchema } from './common';

export const dashboardSummaryQuerySchema = z.object({
  date: businessDateSchema.optional(),
});
export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;

export const dashboardRangeQuerySchema = z
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
export type DashboardRangeQuery = z.infer<typeof dashboardRangeQuerySchema>;

export const dailyReportQuerySchema = z.object({
  date: businessDateSchema.optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;

export const customerOrdersReportQuerySchema = z
  .object({
    customerId: objectIdSchema,
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    mealType: z.enum(MEAL_TYPES).optional(),
    status: z.enum(ORDER_STATUSES).optional(),
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: 'from must be on or before to',
    path: ['from'],
  });
export type CustomerOrdersReportQuery = z.infer<typeof customerOrdersReportQuerySchema>;

export const revenueReportQuerySchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
  })
  .refine((v) => v.from <= v.to, { message: 'from must be on or before to', path: ['from'] });
export type RevenueReportQuery = z.infer<typeof revenueReportQuerySchema>;

export const exportReportQuerySchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
    mealType: z.enum(MEAL_TYPES).optional(),
    customerType: z.enum(CUSTOMER_TYPES).optional(),
    status: z.enum(ORDER_STATUSES).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'from must be on or before to', path: ['from'] });
export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>;
