import { Router, type Request, type Response } from 'express';
import {
  dashboardRangeQuerySchema,
  dashboardSummaryQuerySchema,
  rangeForFilter,
  todayBusinessDate,
  type DateRange,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';
import * as dashboardService from './dashboard.service';

function resolveRange(query: { filter?: Parameters<typeof rangeForFilter>[0]; from?: string; to?: string }): DateRange {
  if (query.filter) return rangeForFilter(query.filter);
  return { from: query.from!, to: query.to! };
}

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, requirePermission('dashboard.view'));

dashboardRouter.get(
  '/summary',
  validate({ query: dashboardSummaryQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, dashboardSummaryQuerySchema);
    ok(res, await dashboardService.summary(query.date ?? todayBusinessDate()));
  }),
);

dashboardRouter.get(
  '/revenue',
  validate({ query: dashboardRangeQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, dashboardRangeQuerySchema);
    ok(res, await dashboardService.revenue(resolveRange(query)));
  }),
);

dashboardRouter.get(
  '/order-statistics',
  validate({ query: dashboardRangeQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, dashboardRangeQuerySchema);
    ok(res, await dashboardService.orderStatistics(resolveRange(query)));
  }),
);
