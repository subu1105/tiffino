import { Types } from 'mongoose';
import type {
  BookingSheetRowDTO,
  BulkBookInput,
  BulkBookResultDTO,
  CreateOrderInput,
  OrderDTO,
  OrdersListQuery,
  Permission,
  UpdateOrderStatusInput,
} from '@tiffino/shared';
import { ORDER_STATUS_TRANSITIONS } from '@tiffino/shared';
import type { AuthUser } from '../../middleware/authenticate';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { serializeOrder } from '../../utils/serialize';

function can(actor: AuthUser, permission: Permission): boolean {
  return actor.role === 'owner' || actor.permissions.includes(permission);
}

/** Book one meal for one customer. The price is snapshotted here and never
 *  changes afterwards, whatever happens to the customer's rates. */
export async function bookOrder(input: CreateOrderInput, actor: AuthUser): Promise<OrderDTO> {
  const customer = await Customer.findById(input.customerId);
  if (!customer) throw ApiError.notFound('Customer not found');
  if (customer.status !== 'active') {
    throw new ApiError(409, 'CUSTOMER_INACTIVE', `${customer.fullName} is deactivated — reactivate them before booking`);
  }

  if (input.priceOverride !== undefined && !can(actor, 'orders.overridePrice')) {
    throw ApiError.forbidden('You are not allowed to override prices', {
      required: 'orders.overridePrice',
    });
  }

  const defaultPrice =
    input.mealType === 'breakfast'
      ? (customer.breakfastPrice ?? 0)
      : input.mealType === 'lunch'
        ? customer.lunchPrice
        : customer.dinnerPrice;
  if (input.mealType === 'breakfast' && defaultPrice <= 0 && input.priceOverride === undefined) {
    throw ApiError.badRequest(
      `Set ${customer.fullName}'s breakfast price first (Customers → Update prices)`,
    );
  }
  const unitPrice = input.priceOverride ?? defaultPrice;
  const quantity = input.quantity ?? 1;

  // A concurrent duplicate insert loses on the partial unique index (E11000),
  // which the central error handler maps to 409 DUPLICATE_BOOKING.
  const order = await Order.create({
    customerId: customer._id,
    orderDate: input.orderDate,
    mealType: input.mealType,
    customerTypeSnapshot: customer.type,
    customerNameSnapshot: customer.fullName,
    price: unitPrice * quantity,
    unitPrice,
    quantity,
    priceOverridden: input.priceOverride !== undefined && input.priceOverride !== defaultPrice,
    status: 'booked',
    active: true,
    createdBy: actor.id,
    updatedBy: actor.id,
  });

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: order.priceOverridden ? 'order.price_overridden' : 'order.booked',
    entity: 'order',
    entityId: order.id,
    after: {
      customer: customer.fullName,
      orderDate: order.orderDate,
      mealType: order.mealType,
      quantity: order.quantity,
      price: order.price,
    },
  });
  return serializeOrder(order, { customerMobile: customer.mobile });
}

/** Bulk booking: all active regular customers, or an explicit selection.
 *  Already-booked and inactive customers are skipped and reported, never errors. */
export async function bulkBook(input: BulkBookInput, actor: AuthUser): Promise<BulkBookResultDTO> {
  const skippedCustomers: BulkBookResultDTO['skippedCustomers'] = [];

  let targets;
  if (input.mode === 'all-regular') {
    targets = await Customer.find({ type: 'regular', status: 'active' });
  } else {
    const selected = await Customer.find({ _id: { $in: input.customerIds } });
    targets = selected.filter((c) => c.status === 'active');
    for (const c of selected.filter((c) => c.status !== 'active')) {
      skippedCustomers.push({ id: c.id, fullName: c.fullName, reason: 'inactive' });
    }
  }
  // Breakfast without a configured price would book ₹0 — skip and report instead.
  if (input.mealType === 'breakfast') {
    for (const c of targets.filter((c) => (c.breakfastPrice ?? 0) <= 0)) {
      skippedCustomers.push({ id: c.id, fullName: c.fullName, reason: 'no-price' });
    }
    targets = targets.filter((c) => (c.breakfastPrice ?? 0) > 0);
  }

  const existing = await Order.find({
    orderDate: input.orderDate,
    mealType: input.mealType,
    active: true,
    customerId: { $in: targets.map((c) => c._id) },
  }).select('customerId');
  const alreadyBooked = new Set(existing.map((o) => String(o.customerId)));

  const toBook = targets.filter((c) => !alreadyBooked.has(c.id));
  for (const c of targets.filter((c) => alreadyBooked.has(c.id))) {
    skippedCustomers.push({ id: c.id, fullName: c.fullName, reason: 'already-booked' });
  }

  let booked = 0;
  if (toBook.length > 0) {
    const docs = toBook.map((c) => {
      const unitPrice =
        input.mealType === 'breakfast'
          ? (c.breakfastPrice ?? 0)
          : input.mealType === 'lunch'
            ? c.lunchPrice
            : c.dinnerPrice;
      return {
      customerId: c._id,
      orderDate: input.orderDate,
      mealType: input.mealType,
      customerTypeSnapshot: c.type,
      customerNameSnapshot: c.fullName,
      price: unitPrice,
      unitPrice,
      quantity: 1,
      priceOverridden: false,
      status: 'booked' as const,
      active: true,
      createdBy: actor.id,
      updatedBy: actor.id,
      };
    });
    try {
      const inserted = await Order.insertMany(docs, { ordered: false });
      booked = inserted.length;
    } catch (err: unknown) {
      // ordered:false keeps inserting past duplicates (booking races); count what landed.
      const bulkErr = err as { insertedDocs?: unknown[]; writeErrors?: { index: number }[] };
      booked = bulkErr.insertedDocs?.length ?? 0;
      const failedIdx = new Set((bulkErr.writeErrors ?? []).map((w) => w.index));
      for (const idx of failedIdx) {
        const c = toBook[idx];
        if (c) skippedCustomers.push({ id: c.id, fullName: c.fullName, reason: 'already-booked' });
      }
    }
  }

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'order.bulk_booked',
    entity: 'order',
    meta: {
      orderDate: input.orderDate,
      mealType: input.mealType,
      mode: input.mode,
      booked,
      skipped: skippedCustomers.length,
    },
  });

  return { booked, skipped: skippedCustomers.length, skippedCustomers };
}

export async function listOrders(query: OrdersListQuery): Promise<{
  orders: OrderDTO[];
  total: number;
}> {
  const filter: Record<string, unknown> = {};
  if (query.date) filter.orderDate = query.date;
  else if (query.from || query.to) {
    filter.orderDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.mealType) filter.mealType = query.mealType;
  if (query.status) filter.status = query.status;
  if (query.customerId) filter.customerId = new Types.ObjectId(query.customerId);
  if (query.customerType) filter.customerTypeSnapshot = query.customerType;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ orderDate: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate<{ customerId: { _id: Types.ObjectId; mobile?: string } }>('customerId', 'mobile'),
    Order.countDocuments(filter),
  ]);

  return {
    orders: orders.map((o) => {
      const populated = o.customerId as unknown as { _id: Types.ObjectId; mobile?: string } | null;
      const dto = serializeOrder(o as never, { customerMobile: populated?.mobile });
      dto.customerId = String(populated?._id ?? o.customerId);
      return dto;
    }),
    total,
  };
}

export async function getOrder(id: string): Promise<OrderDTO> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  return serializeOrder(order);
}

/** Forward transitions only: booked → prepared → delivered (booked → delivered allowed). */
export async function updateOrderStatus(
  id: string,
  input: UpdateOrderStatusInput,
  actor: AuthUser,
): Promise<OrderDTO> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.active) {
    throw new ApiError(409, 'ORDER_NOT_ACTIVE', 'This order was cancelled and can no longer change status');
  }
  const allowed = ORDER_STATUS_TRANSITIONS[order.status as keyof typeof ORDER_STATUS_TRANSITIONS];
  if (!allowed.includes(input.status)) {
    throw new ApiError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot move an order from "${order.status}" to "${input.status}"`,
    );
  }

  const before = order.status;
  order.status = input.status;
  order.updatedBy = new Types.ObjectId(actor.id);
  await order.save();

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'order.status_changed',
    entity: 'order',
    entityId: order.id,
    before: { status: before },
    after: { status: order.status },
  });
  return serializeOrder(order);
}

/** Change how many tiffins this booking is for (1–10). The line total stays
 *  unitPrice × quantity, so every revenue figure updates automatically. */
export async function updateOrderQuantity(
  id: string,
  quantity: number,
  actor: AuthUser,
): Promise<OrderDTO> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.active) {
    throw new ApiError(409, 'ORDER_NOT_ACTIVE', 'This order was cancelled');
  }
  if (order.status === 'delivered') {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A delivered order can no longer change');
  }

  const before = { quantity: order.quantity ?? 1, price: order.price };
  // Legacy rows predate unitPrice — derive it once from the stored total.
  const unitPrice = order.unitPrice ?? Math.round(order.price / (order.quantity ?? 1));
  order.unitPrice = unitPrice;
  order.quantity = quantity;
  order.price = unitPrice * quantity;
  order.updatedBy = new Types.ObjectId(actor.id);
  await order.save();

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'order.quantity_changed',
    entity: 'order',
    entityId: order.id,
    before,
    after: { quantity: order.quantity, price: order.price },
  });
  return serializeOrder(order);
}

/** Cancelling frees the (customer, date, meal) slot for rebooking and removes
 *  the order from every revenue figure, while keeping it in history. */
export async function cancelOrder(id: string, reason: string, actor: AuthUser): Promise<OrderDTO> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === 'cancelled') {
    throw new ApiError(409, 'ORDER_ALREADY_CANCELLED', 'This order is already cancelled');
  }
  if (order.status === 'delivered') {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A delivered order cannot be cancelled');
  }

  const before = order.status;
  order.status = 'cancelled';
  order.active = false;
  order.cancelledAt = new Date();
  order.cancelledBy = new Types.ObjectId(actor.id);
  order.cancellationReason = reason;
  order.updatedBy = new Types.ObjectId(actor.id);
  await order.save();

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'order.cancelled',
    entity: 'order',
    entityId: order.id,
    before: { status: before },
    after: { status: 'cancelled', reason },
  });
  return serializeOrder(order);
}

/** The Daily Orders screen: every active customer with their lunch/dinner
 *  bookings for one date, in a single response. */
export async function bookingSheet(date: string, q?: string): Promise<BookingSheetRowDTO[]> {
  const customerFilter: Record<string, unknown> = { status: 'active' };
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    customerFilter.$or = [{ fullName: { $regex: safe, $options: 'i' } }, { mobile: { $regex: safe } }];
  }

  const customers = await Customer.find(customerFilter).sort({ fullName: 1 });
  const orders = await Order.find({
    orderDate: date,
    active: true,
    customerId: { $in: customers.map((c) => c._id) },
  });

  const byCustomer = new Map<
    string,
    { breakfast: OrderDTO | null; lunch: OrderDTO | null; dinner: OrderDTO | null }
  >();
  for (const o of orders) {
    const key = String(o.customerId);
    const entry = byCustomer.get(key) ?? { breakfast: null, lunch: null, dinner: null };
    entry[o.mealType as 'breakfast' | 'lunch' | 'dinner'] = serializeOrder(o);
    byCustomer.set(key, entry);
  }

  return customers.map((c) => ({
    customer: {
      id: c.id,
      fullName: c.fullName,
      mobile: c.mobile,
      type: c.type as BookingSheetRowDTO['customer']['type'],
      breakfastPrice: c.breakfastPrice ?? 0,
      lunchPrice: c.lunchPrice,
      dinnerPrice: c.dinnerPrice,
    },
    breakfast: byCustomer.get(c.id)?.breakfast ?? null,
    lunch: byCustomer.get(c.id)?.lunch ?? null,
    dinner: byCustomer.get(c.id)?.dinner ?? null,
  }));
}
