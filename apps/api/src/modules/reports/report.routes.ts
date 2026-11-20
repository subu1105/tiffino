import { Router, type Request, type Response } from 'express';
import {
  customerOrdersReportQuerySchema,
  dailyReportQuerySchema,
  exportReportQuerySchema,
  revenueReportQuerySchema,
  todayBusinessDate,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';
import * as reportService from './report.service';

export const reportRouter = Router();

reportRouter.use(authenticate, requirePermission('reports.view'));

reportRouter.get(
  '/daily',
  validate({ query: dailyReportQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, dailyReportQuerySchema);
    ok(res, await reportService.dailyReport({ ...query, date: query.date ?? todayBusinessDate() }));
  }),
);

reportRouter.get(
  '/customer-orders',
  validate({ query: customerOrdersReportQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reportService.customerOrdersReport(getQuery(req, customerOrdersReportQuerySchema)));
  }),
);

reportRouter.get(
  '/revenue',
  validate({ query: revenueReportQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, revenueReportQuerySchema);
    ok(res, await reportService.revenueReport(query.from, query.to));
  }),
);

/** All-time customer-wise ledger CSV: tiffin counts + billed/paid/pending. */
reportRouter.get(
  '/customer-summary/export',
  asyncHandler(async (_req: Request, res: Response) => {
    const { filename, csv } = await reportService.customerSummaryCsv();
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  }),
);

reportRouter.get(
  '/export',
  validate({ query: exportReportQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename, csv } = await reportService.exportCsv(getQuery(req, exportReportQuerySchema));
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  }),
);
