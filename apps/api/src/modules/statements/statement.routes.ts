import { Router, type Request, type Response } from 'express';
import { createStatementSchema, idParamsSchema, statementsListQuerySchema } from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/respond';
import * as statementService from './statement.service';

export const statementRouter = Router();

statementRouter.use(authenticate, requirePermission('payments.view'));

statementRouter.post(
  '/',
  validate({ body: createStatementSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    created(res, await statementService.createStatement(req.body, req.user!));
  }),
);

statementRouter.get(
  '/',
  validate({ query: statementsListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, statementsListQuerySchema);
    ok(res, await statementService.listStatements(query.customerId));
  }),
);

/** Removing a statement record needs money-management rights, not just view. */
statementRouter.delete(
  '/:id',
  requirePermission('payments.record'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await statementService.deleteStatement(req.params.id as string, req.user!);
    ok(res, { message: 'Statement record deleted' });
  }),
);
