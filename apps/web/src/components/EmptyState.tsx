import { CookingPot, Lock, SearchX, UtensilsCrossed, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cls } from '../lib/cls';

const ICONS = {
  food: UtensilsCrossed,
  pot: CookingPot,
  search: SearchX,
  locked: Lock,
  offline: WifiOff,
} as const;

export function EmptyState({
  variant = 'food',
  title,
  message,
  action,
  compact = false,
}: {
  variant?: keyof typeof ICONS;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const Icon = ICONS[variant];
  return (
    <div
      className={cls(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-6 py-10' : 'px-6 py-20',
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-50 text-forest-500">
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h3 className="font-display text-lg font-semibold text-charcoal">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-sm text-charcoal/55">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Standard query-error block with a retry button. */
export function ErrorState({
  title = 'Could not load this',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      variant="offline"
      title={title}
      message={message ?? 'The kitchen lost connection for a moment.'}
      action={
        onRetry && (
          <button type="button" className="btn btn-outline" onClick={onRetry}>
            Try again
          </button>
        )
      }
      compact
    />
  );
}
