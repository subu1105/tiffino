import { Router, type Request, type Response } from 'express';
import { createPaymentSchema, paymentsListQuerySchema } from '@tiffino/shared';
import { z } from 'zod';
import { objectIdSchema } from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildMeta, created, ok } from '../../utils/respond';
import * as paymentService from './payment.service';

const customerIdParamsSchema = z.object({ customerId: objectIdSchema });

export const paymentRouter = Router();

paymentRouter.use(authenticate);

paymentRouter.post(
  '/',
  requirePermission('payments.record'),
  validate({ body: createPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    created(res, await paymentService.recordPayment(req.body, req.user!));
  }),
);

paymentRouter.get(
  '/',
  requirePermission('payments.view'),
  validate({ query: paymentsListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, paymentsListQuerySchema);
    const { payments, total, totalAmount } = await paymentService.listPayments(query);
    ok(res, { payments, totalAmount }, buildMeta(query.page, query.limit, total));
  }),
);

paymentRouter.get(
  '/customer/:customerId',
  requirePermission('payments.view'),
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await paymentService.customerPayments(req.params.customerId as string));
  }),
);
