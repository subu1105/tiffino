import { Types } from 'mongoose';
import type {
  CreatePaymentInput,
  CustomerBalanceDTO,
  PaymentDTO,
  PaymentsListQuery,
} from '@tiffino/shared';
import type { AuthUser } from '../../middleware/authenticate';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { StatementRecord } from '../../models/StatementRecord';
import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { serializePayment } from '../../utils/serialize';

async function userNames(ids: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const users = await User.find({ _id: { $in: unique } }).select('fullName');
  return new Map(users.map((u) => [u.id, u.fullName]));
}

export async function recordPayment(input: CreatePaymentInput, actor: AuthUser): Promise<PaymentDTO> {
  const customer = await Customer.findById(input.customerId);
  if (!customer) throw ApiError.notFound('Customer not found');

  // Optional settlement link: the statement must exist and belong to this customer.
  let statementPeriodLabel: string | null = null;
  if (input.statementId) {
    const statement = await StatementRecord.findById(input.statementId);
    if (!statement || String(statement.customerId) !== input.customerId) {
      throw ApiError.badRequest('That statement does not belong to this customer');
    }
    statementPeriodLabel = statement.periodLabel;
  }

  const payment = await Payment.create({
    ...input,
    statementId: input.statementId ?? null,
    statementPeriodLabel,
    recordedBy: actor.id,
  });
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'payment.recorded',
    entity: 'payment',
    entityId: payment.id,
    after: {
      customer: customer.fullName,
      amount: payment.amount,
      method: payment.method,
      ...(statementPeriodLabel ? { settledAgainst: statementPeriodLabel } : {}),
    },
  });
  return serializePayment(payment, customer.fullName, actor.fullName);
}

export async function listPayments(query: PaymentsListQuery): Promise<{
  payments: PaymentDTO[];
  total: number;
  totalAmount: number;
}> {
  const filter: Record<string, unknown> = {};
  if (query.customerId) filter.customerId = new Types.ObjectId(query.customerId);
  if (query.method) filter.method = query.method;
  if (query.from || query.to) {
    filter.paymentDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  const [payments, total, sumAgg] = await Promise.all([
    Payment.find(filter)
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Payment.countDocuments(filter),
    Payment.aggregate<{ _id: null; sum: number }>([
      { $match: filter },
      { $group: { _id: null, sum: { $sum: '$amount' } } },
    ]),
  ]);

  const customers = await Customer.find({
    _id: { $in: [...new Set(payments.map((p) => String(p.customerId)))] },
  }).select('fullName');
  const customerNames = new Map(customers.map((c) => [c.id, c.fullName]));
  const recorderNames = await userNames(payments.map((p) => String(p.recordedBy)));

  return {
    payments: payments.map((p) =>
      serializePayment(
        p,
        customerNames.get(String(p.customerId)) ?? 'Unknown',
        recorderNames.get(String(p.recordedBy)) ?? 'Unknown',
      ),
    ),
    total,
    totalAmount: sumAgg[0]?.sum ?? 0,
  };
}

/** Billed (active orders) vs collected (payments) — never conflated. */
export async function customerBalance(customerId: string): Promise<CustomerBalanceDTO> {
  const id = new Types.ObjectId(customerId);
  const [billedAgg, paidAgg] = await Promise.all([
    Order.aggregate<{ _id: null; sum: number }>([
      { $match: { customerId: id, active: true } },
      { $group: { _id: null, sum: { $sum: '$price' } } },
    ]),
    Payment.aggregate<{ _id: null; sum: number }>([
      { $match: { customerId: id } },
      { $group: { _id: null, sum: { $sum: '$amount' } } },
    ]),
  ]);
  const totalBilled = billedAgg[0]?.sum ?? 0;
  const totalPaid = paidAgg[0]?.sum ?? 0;
  return { totalBilled, totalPaid, pending: totalBilled - totalPaid };
}

export async function customerPayments(customerId: string): Promise<{
  payments: PaymentDTO[];
  balance: CustomerBalanceDTO;
}> {
  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Customer not found');

  const payments = await Payment.find({ customerId: customer._id }).sort({
    paymentDate: -1,
    createdAt: -1,
  });
  const recorderNames = await userNames(payments.map((p) => String(p.recordedBy)));

  return {
    payments: payments.map((p) =>
      serializePayment(p, customer.fullName, recorderNames.get(String(p.recordedBy)) ?? 'Unknown'),
    ),
    balance: await customerBalance(customerId),
  };
}
