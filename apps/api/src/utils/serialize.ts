import type {
  CustomerDTO,
  OrderDTO,
  OrderStatus,
  PaymentDTO,
  PriceHistoryDTO,
  UserDTO,
} from '@tiffino/shared';
import type { CustomerDoc } from '../models/Customer';
import type { CustomerPriceHistoryDoc } from '../models/CustomerPriceHistory';
import type { OrderDoc } from '../models/Order';
import type { PaymentDoc } from '../models/Payment';
import type { UserDoc } from '../models/User';

const iso = (d: Date | null | undefined): string => (d ? d.toISOString() : '');

export function serializeUser(u: UserDoc): UserDTO {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role as UserDTO['role'],
    permissions: u.permissions as UserDTO['permissions'],
    status: u.status as UserDTO['status'],
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

export function serializeCustomer(
  c: CustomerDoc,
  today?: {
    breakfast: OrderStatus | null;
    lunch: OrderStatus | null;
    dinner: OrderStatus | null;
  },
): CustomerDTO {
  const dto: CustomerDTO = {
    id: c.id,
    fullName: c.fullName,
    mobile: c.mobile,
    address: c.address ?? '',
    type: c.type as CustomerDTO['type'],
    breakfastPrice: c.breakfastPrice ?? 0,
    lunchPrice: c.lunchPrice,
    dinnerPrice: c.dinnerPrice,
    joiningDate: c.joiningDate,
    status: c.status as CustomerDTO['status'],
    notes: c.notes ?? '',
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
  if (today) {
    dto.todayBreakfast = today.breakfast;
    dto.todayLunch = today.lunch;
    dto.todayDinner = today.dinner;
  }
  return dto;
}

interface OrderExtras {
  customerMobile?: string;
  createdByName?: string;
}

export function serializeOrder(o: OrderDoc, extras: OrderExtras = {}): OrderDTO {
  return {
    id: o.id,
    customerId: String(o.customerId),
    customerName: o.customerNameSnapshot,
    customerMobile: extras.customerMobile,
    orderDate: o.orderDate,
    mealType: o.mealType as OrderDTO['mealType'],
    customerTypeSnapshot: o.customerTypeSnapshot as OrderDTO['customerTypeSnapshot'],
    price: o.price,
    unitPrice: o.unitPrice ?? o.price,
    quantity: o.quantity ?? 1,
    priceOverridden: o.priceOverridden ?? false,
    status: o.status as OrderDTO['status'],
    active: o.active ?? true,
    cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
    cancellationReason: o.cancellationReason ?? '',
    createdByName: extras.createdByName,
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.updatedAt),
  };
}

export function serializePayment(
  p: PaymentDoc,
  customerName: string,
  recordedByName: string,
): PaymentDTO {
  return {
    id: p.id,
    customerId: String(p.customerId),
    customerName,
    amount: p.amount,
    paymentDate: p.paymentDate,
    method: p.method as PaymentDTO['method'],
    notes: p.notes ?? '',
    recordedByName,
    createdAt: iso(p.createdAt),
    statementId: p.statementId ? String(p.statementId) : null,
    statementPeriodLabel: p.statementPeriodLabel ?? null,
  };
}

export function serializePriceHistory(
  h: CustomerPriceHistoryDoc,
  changedByName: string,
): PriceHistoryDTO {
  return {
    id: h.id,
    customerId: String(h.customerId),
    breakfastPrice: h.breakfastPrice ?? 0,
    lunchPrice: h.lunchPrice,
    dinnerPrice: h.dinnerPrice,
    prevBreakfastPrice: h.prevBreakfastPrice ?? null,
    prevLunchPrice: h.prevLunchPrice ?? null,
    prevDinnerPrice: h.prevDinnerPrice ?? null,
    effectiveDate: h.effectiveDate,
    changedByName,
    createdAt: iso(h.createdAt),
  };
}
