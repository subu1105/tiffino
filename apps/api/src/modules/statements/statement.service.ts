import { Types } from 'mongoose';
import type { CreateStatementInput, StatementDTO } from '@tiffino/shared';
import type { AuthUser } from '../../middleware/authenticate';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { StatementRecord, type StatementRecordDoc } from '../../models/StatementRecord';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { customerBalance } from '../payments/payment.service';

function settlementStatus(pending: number, receivedSince: number): StatementDTO['settlementStatus'] {
  if (pending <= 0 || receivedSince >= pending) return 'settled';
  return receivedSince > 0 ? 'partial' : 'awaiting';
}

function serialize(s: StatementRecordDoc, receivedSince: number): StatementDTO {
  return {
    id: s.id,
    customerId: String(s.customerId),
    customerName: s.customerNameSnapshot,
    periodLabel: s.periodLabel,
    from: s.from ?? null,
    to: s.to ?? null,
    totalTiffins: s.totalTiffins,
    breakfastCount: s.breakfastCount ?? 0,
    lunchCount: s.lunchCount,
    dinnerCount: s.dinnerCount,
    periodAmount: s.periodAmount,
    totalBilled: s.totalBilled,
    totalPaid: s.totalPaid,
    pending: s.pending,
    generatedByName: s.generatedByName,
    createdAt: s.createdAt ? s.createdAt.toISOString() : '',
    receivedSince,
    settlementStatus: settlementStatus(s.pending, receivedSince),
  };
}

/** Settlement check per statement:
 *  - payments explicitly LINKED to a statement count only for that statement;
 *  - unlinked payments count for every statement generated before them
 *    (the time-based fallback for people who don't bother linking). */
async function serializeWithSettlement(records: StatementRecordDoc[]): Promise<StatementDTO[]> {
  if (records.length === 0) return [];
  const customerIds = [...new Set(records.map((r) => String(r.customerId)))];
  const earliest = new Date(Math.min(...records.map((r) => r.createdAt?.getTime() ?? Date.now())));
  const payments = await Payment.find({
    customerId: { $in: customerIds },
    createdAt: { $gte: earliest },
  }).select('customerId amount createdAt statementId');

  return records.map((r) => {
    const receivedSince = payments
      .filter((p) => {
        if (String(p.customerId) !== String(r.customerId)) return false;
        if (p.statementId) return String(p.statementId) === r.id;
        return Boolean(r.createdAt && p.createdAt && p.createdAt >= r.createdAt);
      })
      .reduce((sum, p) => sum + p.amount, 0);
    return serialize(r, receivedSince);
  });
}

/** Server-side computation keeps the record authoritative: the client only
 *  names the period; every number comes from the database. */
export async function createStatement(
  input: CreateStatementInput,
  actor: AuthUser,
): Promise<StatementDTO> {
  const customer = await Customer.findById(input.customerId);
  if (!customer) throw ApiError.notFound('Customer not found');

  const match: Record<string, unknown> = { customerId: customer._id, active: true };
  if (input.from || input.to) {
    match.orderDate = {
      ...(input.from ? { $gte: input.from } : {}),
      ...(input.to ? { $lte: input.to } : {}),
    };
  }

  const [agg] = await Order.aggregate<{
    _id: null;
    breakfast: number;
    lunch: number;
    dinner: number;
    amount: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        breakfast: {
          $sum: { $cond: [{ $eq: ['$mealType', 'breakfast'] }, { $ifNull: ['$quantity', 1] }, 0] },
        },
        lunch: {
          $sum: { $cond: [{ $eq: ['$mealType', 'lunch'] }, { $ifNull: ['$quantity', 1] }, 0] },
        },
        dinner: {
          $sum: { $cond: [{ $eq: ['$mealType', 'dinner'] }, { $ifNull: ['$quantity', 1] }, 0] },
        },
        amount: { $sum: '$price' },
      },
    },
  ]);
  const breakfast = agg?.breakfast ?? 0;
  const lunch = agg?.lunch ?? 0;
  const dinner = agg?.dinner ?? 0;
  const balance = await customerBalance(input.customerId);

  const record = await StatementRecord.create({
    customerId: customer._id,
    customerNameSnapshot: customer.fullName,
    periodLabel: input.periodLabel,
    from: input.from ?? null,
    to: input.to ?? null,
    totalTiffins: breakfast + lunch + dinner,
    breakfastCount: breakfast,
    lunchCount: lunch,
    dinnerCount: dinner,
    periodAmount: agg?.amount ?? 0,
    totalBilled: balance.totalBilled,
    totalPaid: balance.totalPaid,
    pending: balance.pending,
    generatedBy: actor.id,
    generatedByName: actor.fullName,
  });

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'statement.generated',
    entity: 'payment',
    entityId: record.id,
    after: {
      customer: customer.fullName,
      periodLabel: input.periodLabel,
      periodAmount: record.periodAmount,
      pending: record.pending,
    },
  });

  return serialize(record, 0);
}

export async function listStatements(customerId?: string): Promise<StatementDTO[]> {
  if (customerId && !(await Customer.exists({ _id: new Types.ObjectId(customerId) }))) {
    throw ApiError.notFound('Customer not found');
  }
  const records = await StatementRecord.find(customerId ? { customerId } : {})
    .sort(customerId ? { createdAt: -1 } : { customerNameSnapshot: 1, createdAt: -1 })
    .limit(customerId ? 50 : 200);
  return serializeWithSettlement(records);
}

export async function deleteStatement(id: string, actor: AuthUser): Promise<void> {
  const record = await StatementRecord.findById(id);
  if (!record) throw ApiError.notFound('Statement not found');
  await record.deleteOne();
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'statement.deleted',
    entity: 'payment',
    entityId: record.id,
    before: {
      customer: record.customerNameSnapshot,
      periodLabel: record.periodLabel,
      periodAmount: record.periodAmount,
      pending: record.pending,
    },
  });
}
