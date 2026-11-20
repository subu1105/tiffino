import type { ApiMeta } from '@tiffino/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ meta, onPage }: { meta: ApiMeta; onPage: (page: number) => void }) {
  if (meta.total === 0) return null;
  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1e9dc] px-4 py-3">
      <p className="tnum text-xs text-charcoal/55">
        Showing {start}–{end} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className="tnum px-1 text-xs font-semibold text-charcoal/60">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
