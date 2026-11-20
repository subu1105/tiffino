import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from '../constants';
import { businessDateSchema, mobileSchema, paginationQuerySchema } from './common';

const priceSchema = z.number().int().min(0).max(10000);

export const createCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    mobile: mobileSchema,
    address: z.string().trim().max(300).default(''),
    type: z.enum(CUSTOMER_TYPES),
    /** 0 = customer doesn't take breakfast; booking breakfast then needs an override. */
    breakfastPrice: priceSchema.default(0),
    lunchPrice: priceSchema,
    dinnerPrice: priceSchema,
    joiningDate: businessDateSchema,
    status: z.enum(CUSTOMER_STATUSES).default('active'),
    notes: z.string().trim().max(500).default(''),
  })
  .strict();
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Prices are deliberately absent here — they change only via PUT /customers/:id/prices
 *  so every price change lands in CustomerPriceHistory. */
export const updateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    mobile: mobileSchema.optional(),
    address: z.string().trim().max(300).optional(),
    type: z.enum(CUSTOMER_TYPES).optional(),
    joiningDate: businessDateSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerStatusSchema = z
  .object({ status: z.enum(CUSTOMER_STATUSES) })
  .strict();
export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;

export const updateCustomerPricesSchema = z
  .object({
    /** Omitted = keep the current breakfast price unchanged. */
    breakfastPrice: priceSchema.optional(),
    lunchPrice: priceSchema,
    dinnerPrice: priceSchema,
    effectiveDate: businessDateSchema.optional(),
  })
  .strict();
export type UpdateCustomerPricesInput = z.infer<typeof updateCustomerPricesSchema>;

export const customersListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(80).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  /** When '1', each row carries today's lunch/dinner booking state. */
  todayStatus: z.enum(['0', '1']).default('0'),
});
export type CustomersListQuery = z.infer<typeof customersListQuerySchema>;
