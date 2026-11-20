import type {
  DashboardRevenueDTO,
  DashboardSummaryDTO,
  DateRange,
  OrderStatisticsDTO,
  OrderStatisticsPointDTO,
} from '@tiffino/shared';
import { enumerateDates } from '@tiffino/shared';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { serializeCustomer, serializeOrder } from '../../utils/serialize';

interface MealAgg {
  _id: string; // mealType
  count: number;
  revenue: number;
}

async function mealTotalsForRange(from: string, to: string): Promise<Record<string, MealAgg>> {
  const agg = await Order.aggregate<MealAgg>([
    { $match: { orderDate: { $gte: from, $lte: to }, active: true } },
    {
      $group: {
        _id: '$mealType',
        // Tiffin counts respect quantity (one booking row can be 2 tiffins).
        count: { $sum: { $ifNull: ['$quantity', 1] } },
        revenue: { $sum: '$price' },
      },
    },
  ]);
  return Object.fromEntries(agg.map((a) => [a._id, a]));
}

async function collectedForRange(from: string, to: string): Promise<number> {
  const agg = await Payment.aggregate<{ _id: null; sum: number }>([
    { $match: { paymentDate: { $gte: from, $lte: to } } },
    { $group: { _id: null, sum: { $sum: '$amount' } } },
  ]);
  return agg[0]?.sum ?? 0;
}

export async function summary(date: string): Promise<DashboardSummaryDTO> {
  const [customerCounts, meals, billedAgg, paidAgg, recentBookings, recentCustomers] =
    await Promise.all([
      Customer.aggregate<{ _id: string; count: number }>([
        { $match: { status: 'active' } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      mealTotalsForRange(date, date),
      Order.aggregate<{ _id: null; sum: number }>([
        { $match: { active: true } },
        { $group: { _id: null, sum: { $sum: '$price' } } },
      ]),
      Payment.aggregate<{ _id: null; sum: number }>([
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(8),
      Customer.find().sort({ createdAt: -1 }).limit(5),
    ]);

  const regular = customerCounts.find((c) => c._id === 'regular')?.count ?? 0;
  const occasional = customerCounts.find((c) => c._id === 'occasional')?.count ?? 0;
  const breakfast = meals.breakfast ?? { count: 0, revenue: 0 };
  const lunch = meals.lunch ?? { count: 0, revenue: 0 };
  const dinner = meals.dinner ?? { count: 0, revenue: 0 };

  return {
    date,
    activeCustomers: regular + occasional,
    regularCustomers: regular,
    occasionalCustomers: occasional,
    breakfastOrders: breakfast.count,
    lunchOrders: lunch.count,
    dinnerOrders: dinner.count,
    totalOrders: breakfast.count + lunch.count + dinner.count,
    expectedRevenue: breakfast.revenue + lunch.revenue + dinner.revenue,
    pendingPayments: (billedAgg[0]?.sum ?? 0) - (paidAgg[0]?.sum ?? 0),
    recentBookings: recentBookings.map((o) => serializeOrder(o)),
    recentCustomers: recentCustomers.map((c) => {
      const dto = serializeCustomer(c);
      return { id: dto.id, fullName: dto.fullName, type: dto.type, createdAt: dto.createdAt };
    }),
  };
}

export async function revenue(range: DateRange): Promise<DashboardRevenueDTO> {
  const [meals, collected] = await Promise.all([
    mealTotalsForRange(range.from, range.to),
    collectedForRange(range.from, range.to),
  ]);
  const breakfast = meals.breakfast ?? { count: 0, revenue: 0 };
  const lunch = meals.lunch ?? { count: 0, revenue: 0 };
  const dinner = meals.dinner ?? { count: 0, revenue: 0 };
  return {
    from: range.from,
    to: range.to,
    breakfastOrders: breakfast.count,
    lunchOrders: lunch.count,
    dinnerOrders: dinner.count,
    totalOrders: breakfast.count + lunch.count + dinner.count,
    breakfastRevenue: breakfast.revenue,
    lunchRevenue: lunch.revenue,
    dinnerRevenue: dinner.revenue,
    totalRevenue: breakfast.revenue + lunch.revenue + dinner.revenue,
    collected,
  };
}

export async function orderStatistics(range: DateRange): Promise<OrderStatisticsDTO> {
  const agg = await Order.aggregate<{
    _id: { date: string; mealType: string };
    count: number;
    revenue: number;
  }>([
    { $match: { orderDate: { $gte: range.from, $lte: range.to }, active: true } },
    {
      $group: {
        _id: { date: '$orderDate', mealType: '$mealType' },
        count: { $sum: { $ifNull: ['$quantity', 1] } },
        revenue: { $sum: '$price' },
      },
    },
  ]);

  const byDate = new Map<string, OrderStatisticsPointDTO>();
  for (const date of enumerateDates(range.from, range.to)) {
    byDate.set(date, {
      date,
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      breakfastRevenue: 0,
      lunchRevenue: 0,
      dinnerRevenue: 0,
    });
  }
  for (const row of agg) {
    const point = byDate.get(row._id.date);
    if (!point) continue;
    if (row._id.mealType === 'breakfast') {
      point.breakfast = row.count;
      point.breakfastRevenue = row.revenue;
    } else if (row._id.mealType === 'lunch') {
      point.lunch = row.count;
      point.lunchRevenue = row.revenue;
    } else {
      point.dinner = row.count;
      point.dinnerRevenue = row.revenue;
    }
  }

  return { from: range.from, to: range.to, points: [...byDate.values()] };
}
