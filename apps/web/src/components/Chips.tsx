import type { CustomerType, MealType, OrderStatus } from '@tiffino/shared';
import { Check, Moon, Sun, X } from 'lucide-react';
import { cls } from '../lib/cls';

/** Customer type pill — regular (forest tint) vs occasional (flame tint). */
export function TypeChip({ type }: { type: CustomerType }) {
  return (
    <span
      className={cls(
        'chip capitalize',
        type === 'regular' ? 'bg-forest-50 text-forest-700' : 'bg-flame-50 text-flame-700',
      )}
    >
      {type}
    </span>
  );
}

/** Meal pill — the single source of the lunch/dinner color mapping. */
export function MealChip({ meal, className }: { meal: MealType; className?: string }) {
  const lunch = meal === 'lunch';
  const Icon = lunch ? Sun : Moon;
  return (
    <span
      className={cls(
        'chip capitalize',
        lunch ? 'bg-forest-50 text-forest-700' : 'bg-flame-50 text-flame-700',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meal}
    </span>
  );
}

const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  booked: 'border border-forest-300 bg-white text-forest-700',
  prepared: 'bg-amber-50 text-warning',
  delivered: 'bg-emerald-50 text-success',
  cancelled: 'bg-charcoal/[0.06] text-charcoal/45 line-through',
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cls('chip capitalize', ORDER_STATUS_STYLES[status], className)}>
      {status === 'delivered' && <Check className="h-3 w-3" />}
      {status === 'cancelled' && <X className="h-3 w-3" />}
      {status === 'booked' && <span className="h-1.5 w-1.5 rounded-full bg-forest-500" />}
      {status === 'prepared' && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
      {status}
    </span>
  );
}

/** Active/inactive pill shared by customers and staff. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cls(
        'chip',
        active ? 'bg-emerald-50 text-success' : 'bg-charcoal/[0.06] text-charcoal/50',
      )}
    >
      <span className={cls('h-1.5 w-1.5 rounded-full', active ? 'bg-success' : 'bg-charcoal/30')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/** Did the customer pay after this statement was sent? */
export function SettlementChip({ status }: { status: 'settled' | 'partial' | 'awaiting' }) {
  if (status === 'settled') {
    return (
      <span className="chip bg-emerald-50 text-success">
        <Check className="h-3 w-3" /> Paid
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="chip bg-amber-50 text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Partial
      </span>
    );
  }
  return (
    <span className="chip bg-[#FDECEC] text-danger">
      <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Not paid
    </span>
  );
}
