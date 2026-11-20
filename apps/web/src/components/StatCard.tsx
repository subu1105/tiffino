import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cls } from '../lib/cls';

const VARIANTS = {
  default: { tile: 'bg-forest-50 text-forest-600', value: 'text-charcoal' },
  flame: { tile: 'bg-flame-50 text-flame-600', value: 'text-charcoal' },
  warning: { tile: 'bg-amber-50 text-warning', value: 'text-warning' },
  success: { tile: 'bg-emerald-50 text-success', value: 'text-charcoal' },
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  variant = 'default',
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  variant?: keyof typeof VARIANTS;
  to?: string;
}) {
  const v = VARIANTS[variant];
  const body = (
    <div
      className={cls(
        'card flex items-start gap-3.5 p-5 transition-all',
        to && 'hover:-translate-y-0.5 hover:shadow-lift',
      )}
    >
      <div className={cls('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', v.tile)}>
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-charcoal/50">
          {label}
        </p>
        <p className={cls('tnum mt-1 font-display text-[26px] font-bold leading-8', v.value)}>
          {value}
        </p>
        {sub && <p className="mt-0.5 truncate text-xs text-charcoal/50">{sub}</p>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500">
      {body}
    </Link>
  ) : (
    body
  );
}
