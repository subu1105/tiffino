import { addDays, formatBusinessDate, todayBusinessDate } from '@tiffino/shared';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { cls } from '../lib/cls';

export function DateStrip({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayBusinessDate();
  const isToday = date === today;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center overflow-hidden rounded-xl border border-[#e7decf] bg-white shadow-sm">
        <button
          type="button"
          aria-label="Previous day"
          className="px-2.5 py-2 text-charcoal/50 transition-all hover:bg-forest-50 hover:text-forest-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-500"
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="relative flex items-center gap-2 border-x border-[#f1e9dc] px-3.5 py-2 text-sm font-semibold text-charcoal transition-all hover:bg-forest-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-500"
          onClick={() => inputRef.current?.showPicker?.()}
          title="Pick a date"
        >
          <CalendarDays className="h-4 w-4 text-forest-600" />
          {formatBusinessDate(date)}
          <input
            ref={inputRef}
            type="date"
            aria-label="Choose date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={date}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
          />
        </button>
        <button
          type="button"
          aria-label="Next day"
          className="px-2.5 py-2 text-charcoal/50 transition-all hover:bg-forest-50 hover:text-forest-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-500"
          onClick={() => onChange(addDays(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        className={cls(
          'chip border px-3 py-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
          isToday
            ? 'border-forest-700 bg-forest-800 text-white'
            : 'border-[#e7decf] bg-white text-charcoal/60 hover:border-forest-300 hover:text-forest-700',
        )}
        onClick={() => onChange(today)}
      >
        Today
      </button>
    </div>
  );
}
