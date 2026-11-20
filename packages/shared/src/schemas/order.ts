import { z } from 'zod';
import { CUSTOMER_TYPES, MEAL_TYPES, ORDER_STATUSES } from '../constants';
import { businessDateSchema, objectIdSchema, paginationQuerySchema } from './common';

const priceOverrideSchema = z.number().int().min(0).max(10000);

export const createOrderSchema = z
  .object({
    customerId: objectIdSchema,
    orderDate: businessDateSchema,
    mealType: z.enum(MEAL_TYPES),
    /** How many tiffins (same customer, same meal). Default 1. */
    quantity: z.number().int().min(1).max(10).default(1),
    /** PER-TIFFIN price. Requires orders.overridePrice; otherwise rejected. */
    priceOverride: priceOverrideSchema.optional(),
  })
  .strict();

export const updateOrderQuantitySchema = z
  .object({ quantity: z.number().int().min(1).max(10) })
  .strict();
export type UpdateOrderQuantityInput = z.infer<typeof updateOrderQuantitySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const bulkBookSchema = z
  .object({
    orderDate: businessDateSchema,
    mealType: z.enum(MEAL_TYPES),
    mode: z.enum(['all-regular', 'selected']),
    customerIds: z.array(objectIdSchema).min(1).max(500).optional(),
  })
  .strict()
  .refine((v) => v.mode !== 'selected' || (v.customerIds && v.customerIds.length > 0), {
    message: 'customerIds is required when mode is "selected"',
    path: ['customerIds'],
  });
export type BulkBookInput = z.infer<typeof bulkBookSchema>;

/** Forward transitions only; cancellation has its own endpoint. */
export const updateOrderStatusSchema = z
  .object({ status: z.enum(['prepared', 'delivered']) })
  .strict();
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const cancelOrderSchema = z
  .object({ reason: z.string().trim().max(200).default('') })
  .strict();
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const ordersListQuerySchema = paginationQuerySchema.extend({
  date: businessDateSchema.optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  customerId: objectIdSchema.optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
});
export type OrdersListQuery = z.infer<typeof ordersListQuerySchema>;

export const bookingSheetQuerySchema = z.object({
  date: businessDateSchema,
  q: z.string().trim().max(80).optional(),
});
export type BookingSheetQuery = z.infer<typeof bookingSheetQuerySchema>;
