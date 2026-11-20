import type {
  CreateExpenseInput,
  DateRange,
  ExpenseBookDayDTO,
  ExpenseDTO,
  ExpensesListQuery,
  ProfitLossDTO,
  ProfitLossPointDTO,
} from '@tiffino/shared';
import { enumerateDates, todayBusinessDate } from '@tiffino/shared';
import type { AuthUser } from '../../middleware/authenticate';
import { CookAttendance } from '../../models/CookAttendance';
import { Expense, type ExpenseDoc } from '../../models/Expense';
import { Order } from '../../models/Order';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { toCsv } from '../../utils/csv';

function serialize(e: ExpenseDoc): ExpenseDTO {
  return {
    id: e.id,
    expenseDate: e.expenseDate,
    item: e.item,
    amount: e.amount,
    notes: e.notes ?? '',
    recordedByName: e.recordedByName,
    createdAt: e.createdAt ? e.createdAt.toISOString() : '',
  };
}

export async function addExpense(input: CreateExpenseInput, actor: AuthUser): Promise<ExpenseDTO> {
  const expense = await Expense.create({
    ...input,
    recordedBy: actor.id,
    recordedByName: actor.fullName,
  });
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'expense.recorded',
    entity: 'payment',
    entityId: expense.id,
    after: { date: expense.expenseDate, item: expense.item, amount: expense.amount },
  });
  return serialize(expense);
}

export async function deleteExpense(id: string, actor: AuthUser): Promise<void> {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  await expense.deleteOne();
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'expense.deleted',
    entity: 'payment',
    entityId: expense.id,
    before: { date: expense.expenseDate, item: expense.item, amount: expense.amount },
  });
}

function rangeFilter(from?: string, to?: string): Record<string, unknown> {
  if (!from && !to) return {};
  return {
    expenseDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) },
  };
}

export async function listExpenses(query: ExpensesListQuery): Promise<{
  expenses: ExpenseDTO[];
  total: number;
  totalAmount: number;
}> {
  const filter = rangeFilter(query.from, query.to);
  const [expenses, total, sumAgg] = await Promise.all([
    Expense.find(filter)
      .sort({ expenseDate: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Expense.countDocuments(filter),
    Expense.aggregate<{ _id: null; sum: number }>([
      { $match: filter },
      { $group: { _id: null, sum: { $sum: '$amount' } } },
    ]),
  ]);
  return { expenses: expenses.map(serialize), total, totalAmount: sumAgg[0]?.sum ?? 0 };
}

/** The kharcha book: every day in the range with its items and day total. */
export async function expenseBook(range: DateRange): Promise<{
  days: ExpenseBookDayDTO[];
  grandTotal: number;
}> {
  const expenses = await Expense.find(rangeFilter(range.from, range.to)).sort({
    expenseDate: -1,
    createdAt: 1,
  });
  const byDate = new Map<string, ExpenseBookDayDTO>();
  for (const e of expenses) {
    const day = byDate.get(e.expenseDate) ?? { date: e.expenseDate, items: [], total: 0 };
    day.items.push(serialize(e));
    day.total += e.amount;
    byDate.set(e.expenseDate, day);
  }
  const days = [...byDate.values()];
  return { days, grandTotal: days.reduce((s, d) => s + d.total, 0) };
}

export async function exportCsv(range: DateRange): Promise<{ filename: string; csv: string }> {
  const expenses = await Expense.find(rangeFilter(range.from, range.to)).sort({
    expenseDate: 1,
    createdAt: 1,
  });
  const csv = toCsv(
    ['Date', 'Item', 'Amount (INR)', 'Notes', 'Recorded By'],
    expenses.map((e) => [e.expenseDate, e.item, e.amount, e.notes ?? '', e.recordedByName]),
  );
  return { filename: `tiffino-expenses-${range.from}-to-${range.to}.csv`, csv };
}

/** Profit & loss: tiffin revenue (active orders) minus expenses, with a
 *  zero-filled per-day breakdown for the chart/list. */
export async function profitLoss(range: DateRange): Promise<ProfitLossDTO> {
  const [revenueAgg, expenseAgg, workedDays] = await Promise.all([
    Order.aggregate<{ _id: string; revenue: number }>([
      { $match: { orderDate: { $gte: range.from, $lte: range.to }, active: true } },
      { $group: { _id: '$orderDate', revenue: { $sum: '$price' } } },
    ]),
    Expense.aggregate<{ _id: string; expense: number }>([
      { $match: { expenseDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$expenseDate', expense: { $sum: '$amount' } } },
    ]),
    // Cook's worked/half days count as cost on the day the work happened.
    CookAttendance.find({
      status: { $in: ['worked', 'half-day'] },
      date: { $gte: range.from, $lte: range.to },
    }).select('date dailyRate'),
  ]);

  const revenueByDate = new Map(revenueAgg.map((r) => [r._id, r.revenue]));
  const expenseByDate = new Map(expenseAgg.map((e) => [e._id, e.expense]));
  const wageByDate = new Map(workedDays.map((d) => [d.date, d.dailyRate ?? 0]));

  const byDate: ProfitLossPointDTO[] = enumerateDates(range.from, range.to).map((date) => {
    const revenue = revenueByDate.get(date) ?? 0;
    const cookWage = wageByDate.get(date) ?? 0;
    const expense = (expenseByDate.get(date) ?? 0) + cookWage;
    return { date, revenue, expense, cookWage, profit: revenue - expense };
  });

  const revenue = byDate.reduce((s, p) => s + p.revenue, 0);
  const expense = byDate.reduce((s, p) => s + p.expense, 0);
  const cookWage = byDate.reduce((s, p) => s + p.cookWage, 0);
  return {
    from: range.from,
    to: range.to,
    revenue,
    expense,
    cookWage,
    profit: revenue - expense,
    byDate,
  };
}

export function defaultRange(): DateRange {
  const today = todayBusinessDate();
  return { from: today, to: today };
}
