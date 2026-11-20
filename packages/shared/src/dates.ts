/**
 * Business-date helpers for an India-only business.
 *
 * All business dates (orderDate, paymentDate, joiningDate) are plain
 * 'YYYY-MM-DD' strings computed in Asia/Kolkata. They sort and range-compare
 * lexicographically, which keeps MongoDB queries ($gte/$lte) correct and
 * avoids every UTC off-by-one bug. System timestamps remain UTC Dates.
 */
import type { DashboardFilter } from './constants';

export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

const istFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The 'YYYY-MM-DD' business date for an instant, resolved in Asia/Kolkata. */
export function toBusinessDate(instant: Date = new Date()): string {
  return istFormatter.format(instant); // en-CA yields YYYY-MM-DD
}

export function todayBusinessDate(): string {
  return toBusinessDate(new Date());
}

export function isValidBusinessDate(value: string): boolean {
  if (!BUSINESS_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

/** Anchor a business date at UTC noon so day arithmetic can never cross a date line. */
function atNoonUtc(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function fromNoonUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = atNoonUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromNoonUtc(d);
}

/** 1 = Monday … 7 = Sunday for a business date. */
export function isoWeekday(date: string): number {
  const day = atNoonUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Inclusive date range for a dashboard filter, resolved in Asia/Kolkata.
 *  Weeks run Monday–Sunday; month ranges are calendar months. */
export function rangeForFilter(filter: DashboardFilter, now: Date = new Date()): DateRange {
  const today = toBusinessDate(now);
  switch (filter) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'this-week': {
      const monday = addDays(today, -(isoWeekday(today) - 1));
      return { from: monday, to: today };
    }
    case 'this-month': {
      return { from: `${today.slice(0, 7)}-01`, to: today };
    }
  }
}

/** Every business date from `from` to `to` inclusive (guard: capped at 400 days). */
export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < 400) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** 'Mon, 17 Nov 2026' style label for UI headers. */
export function formatBusinessDate(date: string): string {
  return atNoonUtc(date).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
