import { Router, type Request, type Response } from 'express';
import {
  createCustomerSchema,
  customerStatusSchema,
  customersListQuerySchema,
  idParamsSchema,
  updateCustomerPricesSchema,
  updateCustomerSchema,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildMeta, created, ok } from '../../utils/respond';
import * as customerService from './customer.service';

export const customerRouter = Router();

customerRouter.use(authenticate);

customerRouter.post(
  '/',
  requirePermission('customers.manage'),
  validate({ body: createCustomerSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    created(res, await customerService.createCustomer(req.body, req.user!));
  }),
);

customerRouter.get(
  '/',
  requirePermission('customers.view'),
  validate({ query: customersListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, customersListQuerySchema);
    const { customers, total } = await customerService.listCustomers(query);
    ok(res, customers, buildMeta(query.page, query.limit, total));
  }),
);

customerRouter.get(
  '/:id',
  requirePermission('customers.view'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await customerService.getCustomer(req.params.id as string));
  }),
);

customerRouter.put(
  '/:id',
  requirePermission('customers.manage'),
  validate({ params: idParamsSchema, body: updateCustomerSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await customerService.updateCustomer(req.params.id as string, req.body, req.user!));
  }),
);

customerRouter.patch(
  '/:id/status',
  requirePermission('customers.manage'),
  validate({ params: idParamsSchema, body: customerStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(
      res,
      await customerService.setCustomerStatus(req.params.id as string, req.body.status, req.user!),
    );
  }),
);

customerRouter.get(
  '/:id/prices',
  requirePermission('customers.view'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await customerService.getPrices(req.params.id as string));
  }),
);

customerRouter.put(
  '/:id/prices',
  requirePermission('customers.manage'),
  validate({ params: idParamsSchema, body: updateCustomerPricesSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await customerService.updatePrices(req.params.id as string, req.body, req.user!));
  }),
);
