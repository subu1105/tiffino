import type { ReactNode } from 'react';
import { cls } from '../lib/cls';
import { ListSkeleton } from './Spinner';

export interface Column<T> {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
}

/**
 * Generic table card: sticky header, horizontal scroll guard, loading skeleton,
 * empty slot, and an automatic stacked-card mode below `md` via `renderCard`.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  renderCard,
  footer,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty: ReactNode;
  renderCard?: (row: T) => ReactNode;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (loading) {
    return (
      <div className="card overflow-hidden">
        <ListSkeleton />
      </div>
    );
  }

  if (rows.length === 0) {
    // Keep the footer (pagination) visible: an out-of-range ?page= would
    // otherwise strand the user on an empty screen with no way back.
    return (
      <div className="card overflow-hidden">
        {empty}
        {footer}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Desktop table */}
      <div className={cls('overflow-x-auto', renderCard && 'hidden md:block')}>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-[#f1e9dc] bg-cream/70 backdrop-blur">
              {columns.map((c) => (
                <th key={c.key} className={cls('th', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cls(
                  'border-b border-[#f6f0e6] last:border-b-0',
                  onRowClick && 'cursor-pointer transition-colors hover:bg-forest-50/60',
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cls('td', c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Stacked cards below md */}
      {renderCard && (
        <ul className="divide-y divide-[#f6f0e6] md:hidden">
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              className={cls('p-4', onRowClick && 'cursor-pointer active:bg-forest-50/60')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {renderCard(row)}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}
