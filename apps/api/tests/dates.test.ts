import { describe, expect, it } from 'vitest';
import {
  addDays,
  enumerateDates,
  isValidBusinessDate,
  isoWeekday,
  rangeForFilter,
  toBusinessDate,
} from '@tiffino/shared';

describe('Asia/Kolkata business dates', () => {
  it('resolves the business date in IST, not UTC', () => {
    // 20:00 UTC = 01:30 IST next day — the business date must roll over.
    expect(toBusinessDate(new Date('2026-11-19T20:00:00Z'))).toBe('2026-11-20');
    // 17:00 UTC = 22:30 IST same day.
    expect(toBusinessDate(new Date('2026-11-19T17:00:00Z'))).toBe('2026-11-19');
  });

  it('validates calendar dates strictly', () => {
    expect(isValidBusinessDate('2026-11-20')).toBe(true);
    expect(isValidBusinessDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidBusinessDate('2024-02-29')).toBe(true);
    expect(isValidBusinessDate('2026-13-01')).toBe(false);
    expect(isValidBusinessDate('20-11-2026')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('computes Monday-based weeks and calendar months', () => {
    const friday = new Date('2026-11-20T06:00:00Z'); // Friday in IST
    expect(isoWeekday('2026-11-20')).toBe(5);
    expect(rangeForFilter('this-week', friday)).toEqual({ from: '2026-11-16', to: '2026-11-20' });
    expect(rangeForFilter('this-month', friday)).toEqual({ from: '2026-11-01', to: '2026-11-20' });
    expect(rangeForFilter('yesterday', friday)).toEqual({ from: '2026-11-19', to: '2026-11-19' });
  });

  it('enumerates inclusive ranges', () => {
    expect(enumerateDates('2026-11-28', '2026-12-01')).toEqual([
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ]);
  });
});
