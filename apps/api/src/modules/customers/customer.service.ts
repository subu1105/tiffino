import { Types } from 'mongoose';
import type {
  CreateCustomerInput,
  CustomerDTO,
  CustomerStatsDTO,
  CustomerStatus,
  CustomersListQuery,
  OrderStatus,
  PriceHistoryDTO,
  UpdateCustomerInput,
  UpdateCustomerPricesInput,
} from '@tiffino/shared';
import { todayBusinessDate } from '@tiffino/shared';
import type { AuthUser } from '../../middleware/authenticate';
import { Customer } from '../../models/Customer';
import { CustomerPriceHistory } from '../../models/CustomerPriceHistory';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { serializeCustomer, serializePriceHistory } from '../../utils/serialize';

export async function createCustomer(
  input: CreateCustomerInput,
  actor: AuthUser,
): Promise<CustomerDTO> {
  const existing = await Customer.findOne({ mobile: input.mobile });
  if (existing) {
    throw new ApiError(
      409,
      'DUPLICATE_RESOURCE',
      `A customer with this mobile already exists (${existing.fullName})`,
    );
  }
  const customer = await Customer.create({
    ...input,
    createdBy: actor.id,
    updatedBy: actor.id,
  });
  await CustomerPriceHistory.create({
    customerId: customer._id,
    breakfastPrice: customer.breakfastPrice ?? 0,
    lunchPrice: customer.lunchPrice,
    dinnerPrice: customer.dinnerPrice,
    prevBreakfastPrice: null,
    prevLunchPrice: null,
    prevDinnerPrice: null,
    effectiveDate: customer.joiningDate,
    changedBy: actor.id,
  });
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'customer.created',
    entity: 'customer',
    entityId: customer.id,
    after: { fullName: customer.fullName, mobile: customer.mobile, type: customer.type },
  });
  return serializeCustomer(customer);
}

export async function listCustomers(query: CustomersListQuery): Promise<{
  customers: CustomerDTO[];
  total: number;
}> {
  const filter: Record<string, unknown> = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const safe = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ fullName: { $regex: safe, $options: 'i' } }, { mobile: { $regex: safe } }];
  }

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .sort({ fullName: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Customer.countDocuments(filter),
  ]);

  if (query.todayStatus !== '1' || customers.length === 0) {
    return { customers: customers.map((c) => serializeCustomer(c)), total };
  }

  // Attach today's booking state for the listed page only — two indexed queries.
  const today = todayBusinessDate();
  const orders = await Order.find({
    customerId: { $in: customers.map((c) => c._id) },
    orderDate: today,
    active: true,
  }).select('customerId mealType status');

  const byCustomer = new Map<
    string,
    { breakfast: OrderStatus | null; lunch: OrderStatus | null; dinner: OrderStatus | null }
  >();
  for (const o of orders) {
    const key = String(o.customerId);
    const entry = byCustomer.get(key) ?? { breakfast: null, lunch: null, dinner: null };
    entry[o.mealType as 'breakfast' | 'lunch' | 'dinner'] = o.status as OrderStatus;
    byCustomer.set(key, entry);
  }

  return {
    customers: customers.map((c) =>
      serializeCustomer(c, byCustomer.get(c.id) ?? { breakfast: null, lunch: null, dinner: null }),
    ),
    total,
  };
}

export async function getCustomer(
  id: string,
): Promise<{ customer: CustomerDTO; stats: CustomerStatsDTO }> {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const customerId = new Types.ObjectId(id);
  const [orderAgg, paymentAgg] = await Promise.all([
    Order.aggregate<{
      _id: null;
      totalBreakfast: number;
      totalLunch: number;
      totalDinner: number;
      cancelled: number;
      totalBilled: number;
    }>([
      { $match: { customerId } },
      {
        $group: {
          _id: null,
          // Tiffin counts respect quantity (one row can be 2 tiffins).
          totalBreakfast: {
            $sum: {
              $cond: [
                { $and: ['$active', { $eq: ['$mealType', 'breakfast'] }] },
                { $ifNull: ['$quantity', 1] },
                0,
              ],
            },
          },
          totalLunch: {
            $sum: {
              $cond: [
                { $and: ['$active', { $eq: ['$mealType', 'lunch'] }] },
                { $ifNull: ['$quantity', 1] },
                0,
              ],
            },
          },
          totalDinner: {
            $sum: {
              $cond: [
                { $and: ['$active', { $eq: ['$mealType', 'dinner'] }] },
                { $ifNull: ['$quantity', 1] },
                0,
              ],
            },
          },
          cancelled: { $sum: { $cond: ['$active', 0, { $ifNull: ['$quantity', 1] }] } },
          totalBilled: { $sum: { $cond: ['$active', '$price', 0] } },
        },
      },
    ]),
    Payment.aggregate<{ _id: null; totalPaid: number }>([
      { $match: { customerId } },
      { $group: { _id: null, totalPaid: { $sum: '$amount' } } },
    ]),
  ]);

  const o =
    orderAgg[0] ?? { totalBreakfast: 0, totalLunch: 0, totalDinner: 0, cancelled: 0, totalBilled: 0 };
  const totalPaid = paymentAgg[0]?.totalPaid ?? 0;

  return {
    customer: serializeCustomer(customer),
    stats: {
      totalBreakfastOrders: o.totalBreakfast,
      totalLunchOrders: o.totalLunch,
      totalDinnerOrders: o.totalDinner,
      cancelledOrders: o.cancelled,
      totalBilled: o.totalBilled,
      totalPaid,
      pending: o.totalBilled - totalPaid,
    },
  };
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  actor: AuthUser,
): Promise<CustomerDTO> {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  if (input.mobile && input.mobile !== customer.mobile) {
    const clash = await Customer.findOne({ mobile: input.mobile, _id: { $ne: customer._id } });
    if (clash) {
      throw new ApiError(409, 'DUPLICATE_RESOURCE', 'Another customer already uses this mobile');
    }
  }

  const before = {
    fullName: customer.fullName,
    mobile: customer.mobile,
    type: customer.type,
    address: customer.address,
  };
  Object.assign(customer, input);
  customer.updatedBy = new Types.ObjectId(actor.id);
  await customer.save();

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'customer.updated',
    entity: 'customer',
    entityId: customer.id,
    before,
    after: {
      fullName: customer.fullName,
      mobile: customer.mobile,
      type: customer.type,
      address: customer.address,
    },
  });
  return serializeCustomer(customer);
}

export async function setCustomerStatus(
  id: string,
  status: CustomerStatus,
  actor: AuthUser,
): Promise<CustomerDTO> {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  const before = customer.status;
  customer.status = status;
  customer.updatedBy = new Types.ObjectId(actor.id);
  await customer.save();
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'customer.status_changed',
    entity: 'customer',
    entityId: customer.id,
    before: { status: before },
    after: { status },
  });
  return serializeCustomer(customer);
}

export async function getPrices(id: string): Promise<{
  lunchPrice: number;
  dinnerPrice: number;
  history: PriceHistoryDTO[];
}> {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const history = await CustomerPriceHistory.find({ customerId: customer._id }).sort({
    effectiveDate: -1,
    createdAt: -1,
  });
  const userIds = [...new Set(history.map((h) => String(h.changedBy)))];
  const users = await User.find({ _id: { $in: userIds } }).select('fullName');
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  return {
    lunchPrice: customer.lunchPrice,
    dinnerPrice: customer.dinnerPrice,
    history: history.map((h) =>
      serializePriceHistory(h, nameById.get(String(h.changedBy)) ?? 'Unknown'),
    ),
  };
}

/** The ONLY way prices change — every change lands in CustomerPriceHistory.
 *  Existing orders keep their snapshotted price untouched. */
export async function updatePrices(
  id: string,
  input: UpdateCustomerPricesInput,
  actor: AuthUser,
): Promise<CustomerDTO> {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const prev = {
    breakfastPrice: customer.breakfastPrice ?? 0,
    lunchPrice: customer.lunchPrice,
    dinnerPrice: customer.dinnerPrice,
  };
  // Omitted breakfastPrice = keep the current one unchanged.
  const nextBreakfast = input.breakfastPrice ?? prev.breakfastPrice;
  if (
    prev.breakfastPrice === nextBreakfast &&
    prev.lunchPrice === input.lunchPrice &&
    prev.dinnerPrice === input.dinnerPrice
  ) {
    return serializeCustomer(customer);
  }

  customer.breakfastPrice = nextBreakfast;
  customer.lunchPrice = input.lunchPrice;
  customer.dinnerPrice = input.dinnerPrice;
  customer.updatedBy = new Types.ObjectId(actor.id);
  await customer.save();

  await CustomerPriceHistory.create({
    customerId: customer._id,
    breakfastPrice: nextBreakfast,
    lunchPrice: input.lunchPrice,
    dinnerPrice: input.dinnerPrice,
    prevBreakfastPrice: prev.breakfastPrice,
    prevLunchPrice: prev.lunchPrice,
    prevDinnerPrice: prev.dinnerPrice,
    effectiveDate: input.effectiveDate ?? todayBusinessDate(),
    changedBy: actor.id,
  });

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'customer.price_changed',
    entity: 'customer',
    entityId: customer.id,
    before: prev,
    after: {
      breakfastPrice: nextBreakfast,
      lunchPrice: input.lunchPrice,
      dinnerPrice: input.dinnerPrice,
    },
  });
  return serializeCustomer(customer);
}
