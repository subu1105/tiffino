import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { listCustomers } from '../api/endpoints';
import { useDebounced } from '../lib/useDebounced';
import { Spinner } from './Spinner';

export interface CustomerOption {
  id: string;
  fullName: string;
  mobile: string;
}

/** Searchable customer picker backed by GET /customers?q= (active customers). */
export function CustomerSelect({
  value,
  onChange,
  placeholder = 'Search customer…',
  disabled,
  autoFocus,
}: {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounced(query, 300);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['customer-search', debouncedQ],
    queryFn: () => listCustomers({ q: debouncedQ, status: 'active', limit: 20, page: 1 }),
    enabled: open && !disabled,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (value) {
    return (
      <div className="input flex items-center justify-between gap-2 py-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-charcoal">{value.fullName}</span>
          <span className="tnum block text-[11px] text-charcoal/45">{value.mobile}</span>
        </span>
        {!disabled && (
          <button
            type="button"
            aria-label="Clear customer"
            className="rounded-md p-1 text-charcoal/40 transition-all hover:bg-forest-50 hover:text-charcoal"
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const options = data?.data ?? [];

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/35" />
        <input
          className="input pl-9"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        {isFetching && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[#efe7db] bg-white py-1.5 shadow-lift">
          {options.length === 0 && !isFetching ? (
            <p className="px-3.5 py-3 text-sm text-charcoal/50">
              {debouncedQ ? `No customers match “${debouncedQ}”` : 'No active customers yet'}
            </p>
          ) : (
            options.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-forest-50"
                onClick={() => {
                  onChange({ id: c.id, fullName: c.fullName, mobile: c.mobile });
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="truncate text-sm font-medium text-charcoal">{c.fullName}</span>
                <span className="tnum shrink-0 text-xs text-charcoal/45">{c.mobile}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
