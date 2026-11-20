import { Router, type Request, type Response } from 'express';
import {
  cookLedgerQuerySchema,
  createCookEntrySchema,
  idParamsSchema,
  markCookAttendanceSchema,
  type CookAttendanceDTO,
  type CookAttendanceSummaryDTO,
  type CookEntryDTO,
  type CookLedgerDTO,
} from '@tiffino/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/requirePermission';
import { getQuery, validate } from '../../middleware/validate';
import { CookAttendance, type CookAttendanceDoc } from '../../models/CookAttendance';
import { CookEntry, type CookEntryDoc } from '../../models/CookEntry';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { writeAudit } from '../../utils/audit';
import { created, ok } from '../../utils/respond';

function serialize(e: CookEntryDoc): CookEntryDTO {
  return {
    id: e.id,
    entryDate: e.entryDate,
    kind: e.kind as CookEntryDTO['kind'],
    amount: e.amount,
    notes: e.notes ?? '',
    recordedByName: e.recordedByName,
    createdAt: e.createdAt ? e.createdAt.toISOString() : '',
  };
}

function serializeAttendance(a: CookAttendanceDoc): CookAttendanceDTO {
  return {
    id: a.id,
    date: a.date,
    status: a.status as CookAttendanceDTO['status'],
    dailyRate: a.dailyRate ?? 0,
    recordedByName: a.recordedByName,
    createdAt: a.createdAt ? a.createdAt.toISOString() : '',
  };
}

export const cookRouter = Router();

cookRouter.use(authenticate);

/** Mark (or correct) one day — upsert keyed on the date. */
cookRouter.post(
  '/attendance',
  requirePermission('expenses.record'),
  validate({ body: markCookAttendanceSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { date, status } = req.body as {
      date: string;
      status: 'worked' | 'half-day' | 'leave';
    };
    const dailyRate = status === 'leave' ? 0 : (req.body.dailyRate as number);
    const entry = await CookAttendance.findOneAndUpdate(
      { date },
      {
        $set: {
          status,
          dailyRate,
          recordedBy: req.user!.id,
          recordedByName: req.user!.fullName,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    writeAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'cook.attendance_marked',
      entity: 'payment',
      entityId: entry.id,
      after: { date, status, dailyRate },
    });
    ok(res, serializeAttendance(entry));
  }),
);

cookRouter.get(
  '/attendance',
  requirePermission('expenses.view'),
  validate({ query: cookLedgerQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, cookLedgerQuerySchema);
    const filter: Record<string, unknown> = {};
    if (query.from || query.to) {
      filter.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const [days, lastWorked] = await Promise.all([
      CookAttendance.find(filter).sort({ date: -1 }).limit(400),
      CookAttendance.findOne({ status: 'worked' }).sort({ date: -1 }),
    ]);
    const worked = days.filter((d) => d.status === 'worked');
    const half = days.filter((d) => d.status === 'half-day');
    const payload: CookAttendanceSummaryDTO = {
      days: days.map(serializeAttendance),
      workedDays: worked.length,
      halfDays: half.length,
      leaveDays: days.length - worked.length - half.length,
      wageTotal: [...worked, ...half].reduce((s, d) => s + (d.dailyRate ?? 0), 0),
      // Prefill comes from the last FULL day — half days would halve it again.
      lastRate: lastWorked ? (lastWorked.dailyRate ?? null) : null,
    };
    ok(res, payload);
  }),
);

cookRouter.delete(
  '/attendance/:id',
  requirePermission('expenses.record'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const entry = await CookAttendance.findById(req.params.id as string);
    if (!entry) throw ApiError.notFound('Attendance entry not found');
    await entry.deleteOne();
    writeAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'cook.attendance_deleted',
      entity: 'payment',
      entityId: entry.id,
      before: { date: entry.date, status: entry.status, dailyRate: entry.dailyRate },
    });
    ok(res, { message: 'Attendance entry deleted' });
  }),
);

cookRouter.post(
  '/',
  requirePermission('expenses.record'),
  validate({ body: createCookEntrySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const entry = await CookEntry.create({
      ...req.body,
      recordedBy: req.user!.id,
      recordedByName: req.user!.fullName,
    });
    writeAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: entry.kind === 'paid' ? 'cook.paid' : 'cook.returned',
      entity: 'payment',
      entityId: entry.id,
      after: { date: entry.entryDate, kind: entry.kind, amount: entry.amount },
    });
    created(res, serialize(entry));
  }),
);

cookRouter.get(
  '/',
  requirePermission('expenses.view'),
  validate({ query: cookLedgerQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req, cookLedgerQuerySchema);
    const filter: Record<string, unknown> = {};
    if (query.from || query.to) {
      filter.entryDate = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const entries = await CookEntry.find(filter).sort({ entryDate: -1, createdAt: -1 }).limit(500);
    const totalPaid = entries.filter((e) => e.kind === 'paid').reduce((s, e) => s + e.amount, 0);
    const totalReturned = entries
      .filter((e) => e.kind === 'return')
      .reduce((s, e) => s + e.amount, 0);
    const payload: CookLedgerDTO = {
      entries: entries.map(serialize),
      totalPaid,
      totalReturned,
      net: totalPaid - totalReturned,
    };
    ok(res, payload);
  }),
);

cookRouter.delete(
  '/:id',
  requirePermission('expenses.record'),
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const entry = await CookEntry.findById(req.params.id as string);
    if (!entry) throw ApiError.notFound('Entry not found');
    await entry.deleteOne();
    writeAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: 'cook.entry_deleted',
      entity: 'payment',
      entityId: entry.id,
      before: { date: entry.entryDate, kind: entry.kind, amount: entry.amount },
    });
    ok(res, { message: 'Entry deleted' });
  }),
);
