import { Types } from 'mongoose';
import type {
  CustomerOrdersReportQuery,
  DailyReportDTO,
  DailyReportQuery,
  DailyReportRowDTO,
  ExportReportQuery,
  OrderDTO,
  RevenueReportDTO,
} from '@tiffino/shared';
import { todayBusinessDate } from '@tiffino/shared';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { ApiError } from '../../utils/ApiError';
import { toCsv } from '../../utils/csv';
import { serializeOrder } from '../../utils/serialize';
import * as dashboardService from '../dashboard/dashboard.service';

/** One day's orders with customer-wise rows. Cancelled orders are listed only
 *  when explicitly asked for (status filter) and never counted in revenue. */
export async function dailyReport(query: DailyReportQuery & { date: string }): Promise<DailyReportDTO> {
  const filter: Record<string, unknown> = { orderDate: query.date };
  if (query.mealType) filter.mealType = query.mealType;
  if (query.customerType) filter.customerTypeSnapshot = query.customerType;
  if (query.status) filter.status = query.status;
  else filter.active = true;

  const orders = await Order.find(filter).sort({ mealType: 1, customerNameSnapshot: 1 });

  const customers = await Customer.find({
    _id: { $in: [...new Set(orders.map((o) => String(o.customerId)))] },
  }).select('mobile');
  const mobileById = new Map(customers.map((c) => [c.id, c.mobile]));

  const rows: DailyReportRowDTO[] = orders.map((o) => ({
    orderId: o.id,
    customerId: String(o.customerId),
    customerName: o.customerNameSnapshot,
    customerMobile: mobileById.get(String(o.customerId)) ?? '',
    customerType: o.customerTypeSnapshot as DailyReportRowDTO['customerType'],
    mealType: o.mealType as DailyReportRowDTO['mealType'],
    quantity: o.quantity ?? 1,
    price: o.price,
    status: o.status as DailyReportRowDTO['status'],
  }));

  const activeRows = rows.filter((r) => r.status !== 'cancelled');
  const tiffins = (rs: DailyReportRowDTO[]) => rs.reduce((s, r) => s + r.quantity, 0);
  const amount = (rs: DailyReportRowDTO[]) => rs.reduce((s, r) => s + r.price, 0);
  const breakfastRows = activeRows.filter((r) => r.mealType === 'breakfast');
  const lunchRows = activeRows.filter((r) => r.mealType === 'lunch');
  const dinnerRows = activeRows.filter((r) => r.mealType === 'dinner');

  return {
    date: query.date,
    breakfastOrders: tiffins(breakfastRows),
    lunchOrders: tiffins(lunchRows),
    dinnerOrders: tiffins(dinnerRows),
    totalTiffins: tiffins(activeRows),
    breakfastRevenue: amount(breakfastRows),
    lunchRevenue: amount(lunchRows),
    dinnerRevenue: amount(dinnerRows),
    totalRevenue: amount(activeRows),
    cancelledOrders: tiffins(rows.filter((r) => r.status === 'cancelled')),
    rows,
  };
}

export async function customerOrdersReport(query: CustomerOrdersReportQuery): Promise<{
  orders: OrderDTO[];
  totalOrders: number;
  totalAmount: number;
}> {
  const customer = await Customer.findById(query.customerId);
  if (!customer) throw ApiError.notFound('Customer not found');

  const filter: Record<string, unknown> = { customerId: new Types.ObjectId(query.customerId) };
  if (query.from || query.to) {
    filter.orderDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.mealType) filter.mealType = query.mealType;
  if (query.status) filter.status = query.status;

  const orders = await Order.find(filter).sort({ orderDate: -1, mealType: 1 });
  const active = orders.filter((o) => o.active);
  return {
    orders: orders.map((o) => serializeOrder(o, { customerMobile: customer.mobile })),
    totalOrders: active.reduce((s, o) => s + (o.quantity ?? 1), 0),
    totalAmount: active.reduce((s, o) => s + o.price, 0),
  };
}

export async function revenueReport(from: string, to: string): Promise<RevenueReportDTO> {
  const [rev, stats] = await Promise.all([
    dashboardService.revenue({ from, to }),
    dashboardService.orderStatistics({ from, to }),
  ]);
  return {
    from,
    to,
    totalOrders: rev.totalOrders,
    breakfastRevenue: rev.breakfastRevenue,
    lunchRevenue: rev.lunchRevenue,
    dinnerRevenue: rev.dinnerRevenue,
    totalRevenue: rev.totalRevenue,
    collected: rev.collected,
    byDate: stats.points,
  };
}

/** All-time customer-wise ledger: every customer with their tiffin counts,
 *  billed amount (active orders only), payments received, and pending balance. */
export async function customerSummaryCsv(): Promise<{ filename: string; csv: string }> {
  const [customers, orderAgg, payAgg] = await Promise.all([
    Customer.find().sort({ fullName: 1 }),
    Order.aggregate<{
      _id: Types.ObjectId;
      breakfast: number;
      lunch: number;
      dinner: number;
      billed: number;
    }>([
      { $match: { active: true } },
      {
        $group: {
          _id: '$customerId',
          breakfast: {
            $sum: { $cond: [{ $eq: ['$mealType', 'breakfast'] }, { $ifNull: ['$quantity', 1] }, 0] },
          },
          lunch: {
            $sum: { $cond: [{ $eq: ['$mealType', 'lunch'] }, { $ifNull: ['$quantity', 1] }, 0] },
          },
          dinner: {
            $sum: { $cond: [{ $eq: ['$mealType', 'dinner'] }, { $ifNull: ['$quantity', 1] }, 0] },
          },
          billed: { $sum: '$price' },
        },
      },
    ]),
    Payment.aggregate<{ _id: Types.ObjectId; paid: number }>([
      { $group: { _id: '$customerId', paid: { $sum: '$amount' } } },
    ]),
  ]);

  const ordersById = new Map(orderAgg.map((o) => [String(o._id), o]));
  const paidById = new Map(payAgg.map((p) => [String(p._id), p.paid]));

  const rows = customers.map((c) => {
    const o = ordersById.get(c.id) ?? { breakfast: 0, lunch: 0, dinner: 0, billed: 0 };
    const paid = paidById.get(c.id) ?? 0;
    return [
      c.fullName,
      c.mobile,
      c.type,
      c.status,
      o.breakfast,
      o.lunch,
      o.dinner,
      o.breakfast + o.lunch + o.dinner,
      o.billed,
      paid,
      o.billed - paid,
    ];
  });

  const csv = toCsv(
    [
      'Customer',
      'Mobile',
      'Type',
      'Status',
      'Breakfast Tiffins',
      'Lunch Tiffins',
      'Dinner Tiffins',
      'Total Tiffins',
      'Total Amount (INR)',
      'Paid (INR)',
      'Pending (INR)',
    ],
    rows,
  );
  return { filename: `tiffino-customer-summary-${todayBusinessDate()}.csv`, csv };
}

export async function exportCsv(query: ExportReportQuery): Promise<{ filename: string; csv: string }> {
  const filter: Record<string, unknown> = { orderDate: { $gte: query.from, $lte: query.to } };
  if (query.mealType) filter.mealType = query.mealType;
  if (query.customerType) filter.customerTypeSnapshot = query.customerType;
  if (query.status) filter.status = query.status;

  const orders = await Order.find(filter).sort({ orderDate: 1, mealType: 1, customerNameSnapshot: 1 });
  const customers = await Customer.find({
    _id: { $in: [...new Set(orders.map((o) => String(o.customerId)))] },
  }).select('mobile');
  const mobileById = new Map(customers.map((c) => [c.id, c.mobile]));

  const csv = toCsv(
    ['Date', 'Meal', 'Customer', 'Mobile', 'Customer Type', 'Qty', 'Unit (INR)', 'Price (INR)', 'Status'],
    orders.map((o) => [
      o.orderDate,
      o.mealType,
      o.customerNameSnapshot,
      mobileById.get(String(o.customerId)) ?? '',
      o.customerTypeSnapshot,
      o.quantity ?? 1,
      o.unitPrice ?? o.price,
      o.price,
      o.status,
    ]),
  );

  return { filename: `tiffino-orders-${query.from}-to-${query.to}.csv`, csv };
}
