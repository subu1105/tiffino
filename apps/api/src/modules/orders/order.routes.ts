import { Router, type Request, type Response } from 'express';
import {
  bookingSheetQuerySchema,
  bulkBookSchema,
  cancelOrderSchema,
  createOrderSchema,
  idParamsSchema,
  ordersListQuerySchema,
  updateOrderQuantitySchema,
  updateOrderStatusSchema,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildMeta, created, ok } from '../../utils/respond';
import * as orderService from './order.service';

export const orderRouter = Router();

orderRouter.use(authenticate);

orderRouter.post(
  '/',
  requirePermission('orders.book'),
  validate({ body: createOrderSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    created(res, await orderService.bookOrder(req.body, req.user!));
  }),
);

orderRouter.post(
  '/bulk-book',
  requirePermission('orders.book'),
  validate({ body: bulkBookSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await orderService.bulkBook(req.body, req.user!));
  }),
);

/** Daily Orders screen data: all active customers + their bookings for a date. */
orderRouter.get(
  '/sheet',
  requirePermission('orders.view'),
  validate({ query: bookingSheetQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, bookingSheetQuerySchema);
    ok(res, await orderService.bookingSheet(query.date, query.q));
  }),
);

orderRouter.get(
  '/',
  requirePermission('orders.view'),
  validate({ query: ordersListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, ordersListQuerySchema);
    const { orders, total } = await orderService.listOrders(query);
    ok(res, orders, buildMeta(query.page, query.limit, total));
  }),
);

orderRouter.get(
  '/:id',
  requirePermission('orders.view'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await orderService.getOrder(req.params.id as string));
  }),
);

orderRouter.patch(
  '/:id/quantity',
  requirePermission('orders.book'),
  validate({ params: idParamsSchema, body: updateOrderQuantitySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await orderService.updateOrderQuantity(req.params.id as string, req.body.quantity, req.user!));
  }),
);

orderRouter.patch(
  '/:id/status',
  requirePermission('orders.updateStatus'),
  validate({ params: idParamsSchema, body: updateOrderStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await orderService.updateOrderStatus(req.params.id as string, req.body, req.user!));
  }),
);

orderRouter.patch(
  '/:id/cancel',
  requirePermission('orders.cancel'),
  validate({ params: idParamsSchema, body: cancelOrderSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await orderService.cancelOrder(req.params.id as string, req.body.reason, req.user!));
  }),
);
