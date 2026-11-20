import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cls } from '../lib/cls';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

/** Row ⋯ menu — closes on outside click / Escape. */
export function RowMenu({ items, label = 'Row actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="rounded-lg p-1.5 text-charcoal/45 transition-all hover:bg-forest-50 hover:text-forest-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-[#efe7db] bg-white py-1.5 shadow-lift">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={cls(
                  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors',
                  item.tone === 'danger'
                    ? 'text-danger hover:bg-red-50'
                    : 'text-charcoal/80 hover:bg-forest-50 hover:text-forest-800',
                )}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
