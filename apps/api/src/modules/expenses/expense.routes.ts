import { Router, type Request, type Response } from 'express';
import {
  createExpenseSchema,
  expenseRangeQuerySchema,
  expensesListQuerySchema,
  idParamsSchema,
  profitLossQuerySchema,
  rangeForFilter,
  type DateRange,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildMeta, created, ok } from '../../utils/respond';
import * as expenseService from './expense.service';

export const expenseRouter = Router();

expenseRouter.use(authenticate);

expenseRouter.post(
  '/',
  requirePermission('expenses.record'),
  validate({ body: createExpenseSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    created(res, await expenseService.addExpense(req.body, req.user!));
  }),
);

expenseRouter.get(
  '/',
  requirePermission('expenses.view'),
  validate({ query: expensesListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, expensesListQuerySchema);
    const { expenses, total, totalAmount } = await expenseService.listExpenses(query);
    ok(res, { expenses, totalAmount }, buildMeta(query.page, query.limit, total));
  }),
);

/** The kharcha book: date-grouped items with day totals. */
expenseRouter.get(
  '/book',
  requirePermission('expenses.view'),
  validate({ query: expenseRangeQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const range = getQuery(req, expenseRangeQuerySchema);
    ok(res, await expenseService.expenseBook(range));
  }),
);

expenseRouter.get(
  '/export',
  requirePermission('expenses.view'),
  validate({ query: expenseRangeQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename, csv } = await expenseService.exportCsv(getQuery(req, expenseRangeQuerySchema));
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  }),
);

/** Revenue vs expense: today / yesterday / this-week / this-month or custom range. */
expenseRouter.get(
  '/profit-loss',
  requirePermission('expenses.view'),
  validate({ query: profitLossQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, profitLossQuerySchema);
    const range: DateRange = query.filter
      ? rangeForFilter(query.filter)
      : { from: query.from!, to: query.to! };
    ok(res, await expenseService.profitLoss(range));
  }),
);

expenseRouter.delete(
  '/:id',
  requirePermission('expenses.record'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await expenseService.deleteExpense(req.params.id as string, req.user!);
    ok(res, { message: 'Expense deleted' });
  }),
);
