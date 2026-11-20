import {
  buildCookAttendanceHtml,
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  todayBusinessDate,
  type CookAttendanceDTO,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  FileDown,
  IndianRupee,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { deleteCookAttendance, getCookAttendance, markCookAttendance } from '../../api/endpoints';
import { useCan } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { ListSkeleton, Spinner, StatCardSkeleton } from '../../components/Spinner';
import { StatCard } from '../../components/StatCard';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';
import { openPrintWindow } from '../../lib/print-html';

type RangeKey = 'this-week' | 'this-month' | 'all';
type Status = 'worked' | 'half-day' | 'leave';

const STATUS_LABEL: Record<Status, string> = {
  worked: 'Worked',
  'half-day': 'Half day',
  leave: 'Leave',
};

/** Cook attendance: worked / half-day / leave per date — wages flow into P&L. */
export function CookAttendancePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canRecord = useCan('expenses.record');
  const today = todayBusinessDate();

  const [rangeKey, setRangeKey] = useState<RangeKey>('this-month');
  const range = rangeKey === 'all' ? null : rangeForFilter(rangeKey);
  const periodLabel = range
    ? `${formatBusinessDate(range.from)} – ${formatBusinessDate(range.to)}`
    : 'All time';

  const attendanceQuery = useQuery({
    queryKey: ['cook-attendance', range?.from ?? 'all', range?.to ?? 'all'],
    queryFn: () => getCookAttendance(range?.from, range?.to),
  });
  const attendance = attendanceQuery.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cook-attendance'] });
    // Worked/half days are a P&L cost — refresh every profit figure.
    void queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
  };

  /* ---------------- marking ---------------- */

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<Status>('worked');
  const [rate, setRate] = useState('');
  const [formError, setFormError] = useState('');

  const markMutation = useMutation({
    mutationFn: (input: { date: string; status: Status; dailyRate?: number }) =>
      markCookAttendance(input),
    onSuccess: (entry) => {
      invalidate();
      toast.success(
        `${formatBusinessDate(entry.date)} marked ${STATUS_LABEL[entry.status].toLowerCase()}`,
        entry.status === 'leave' ? undefined : `${formatINR(entry.dailyRate)} counted in P&L`,
      );
      setOpen(false);
    },
    onError: (err) => toast.apiError(err, 'Could not mark attendance'),
  });

  // Sensible wage to pre-fill: last full wage (default ₹600), halved for half days.
  const defaultRateFor = (s: Status) => {
    const full = attendance?.lastRate || 600;
    return s === 'half-day' ? Math.round(full / 2) : full;
  };

  const quickMark = (s: Status) => {
    if (s === 'leave') {
      markMutation.mutate({ date: today, status: 'leave' });
      return;
    }
    if (attendance?.lastRate) {
      markMutation.mutate({ date: today, status: s, dailyRate: defaultRateFor(s) });
    } else {
      // First time: confirm the wage (pre-filled with the usual amount).
      setDate(today);
      setStatus(s);
      setRate(String(defaultRateFor(s)));
      setOpen(true);
    }
  };

  const pickStatus = (s: Status) => {
    setStatus(s);
    if (s !== 'leave') setRate(String(defaultRateFor(s)));
  };

  const saveAttendance = () => {
    const n = rate.trim() === '' ? NaN : Number(rate);
    if (status !== 'leave' && (!Number.isInteger(n) || n < 1)) {
      setFormError('Enter the wage for this day');
      return;
    }
    setFormError('');
    markMutation.mutate({
      date,
      status,
      ...(status !== 'leave' ? { dailyRate: n } : {}),
    });
  };

  const removeDay = async (a: CookAttendanceDTO) => {
    const { ok } = await confirm({
      title: 'Remove this day?',
      body: `${formatBusinessDate(a.date)} · ${STATUS_LABEL[a.status]}${
        a.status === 'leave' ? '' : ` (${formatINR(a.dailyRate)})`
      }`,
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await deleteCookAttendance(a.id);
      invalidate();
      toast.success('Day removed');
    } catch (err) {
      toast.apiError(err, 'Remove failed');
    }
  };

  const printPdf = () => {
    if (!attendance) return;
    try {
      openPrintWindow(buildCookAttendanceHtml({ periodLabel, ...attendance }));
    } catch (err) {
      toast.apiError(err, 'Could not open the PDF window');
    }
  };

  return (
    <div>
      <PageHeader
        title="Cook Attendance"
        subtitle={periodLabel}
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!attendance}
            onClick={printPdf}
            title="Open a print window — choose 'Save as PDF'"
          >
            <FileDown className="h-4 w-4" /> PDF
          </button>
        }
      />

      {/* Range pills */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(
          [
            ['this-week', 'Week'],
            ['this-month', 'Month'],
            ['all', 'All time'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={cls(
              'chip px-3.5 py-1.5 transition-all',
              rangeKey === key
                ? 'bg-forest-800 text-cream'
                : 'bg-white text-charcoal/60 hover:bg-forest-50',
            )}
            onClick={() => setRangeKey(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Counters */}
      {attendanceQuery.isPending ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : attendance ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={CalendarCheck2}
            label="Worked"
            value={`${attendance.workedDays} days`}
          />
          <StatCard icon={CalendarClock} label="Half days" value={String(attendance.halfDays)} />
          <StatCard icon={CalendarX2} label="Leave" value={`${attendance.leaveDays} days`} />
          <StatCard
            icon={IndianRupee}
            label="Total wages"
            value={formatINR(attendance.wageTotal)}
            variant="flame"
          />
        </div>
      ) : null}

      {/* Quick marking */}
      {canRecord && (
        <div className="card mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal/55">
                Mark today
              </h2>
              <p className="mt-0.5 text-xs text-charcoal/50">
                Worked and half days add their wage into Profit &amp; Loss automatically.
                Re-marking a day corrects it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={markMutation.isPending}
                onClick={() => quickMark('worked')}
              >
                <CalendarCheck2 className="h-4 w-4" /> Worked today
              </button>
              <button
                type="button"
                className="btn btn-flame btn-sm"
                disabled={markMutation.isPending}
                onClick={() => quickMark('half-day')}
              >
                <CalendarClock className="h-4 w-4" /> Half day
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={markMutation.isPending}
                onClick={() => quickMark('leave')}
              >
                <CalendarX2 className="h-4 w-4" /> Leave today
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDate(today);
                  setStatus('worked');
                  setRate(String(defaultRateFor('worked')));
                  setOpen(true);
                }}
              >
                Other day…
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day-by-day table */}
      <div className="card overflow-hidden">
        {attendanceQuery.isPending ? (
          <ListSkeleton />
        ) : attendanceQuery.isError ? (
          <ErrorState onRetry={() => attendanceQuery.refetch()} />
        ) : (attendance?.days.length ?? 0) === 0 ? (
          <EmptyState
            variant="pot"
            title="No days marked yet"
            message="Mark today with the buttons above — wages join P&L automatically."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc] bg-cream/70">
                  <th className="th">Date</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Wage</th>
                  <th className="th">Marked by</th>
                  {canRecord && <th className="th text-right"></th>}
                </tr>
              </thead>
              <tbody>
                {attendance!.days.map((a) => (
                  <tr key={a.id} className="border-b border-[#f6f0e6] last:border-b-0">
                    <td className="td whitespace-nowrap text-sm">{formatBusinessDate(a.date)}</td>
                    <td className="td">
                      <span
                        className={cls(
                          'chip',
                          a.status === 'worked'
                            ? 'bg-forest-50 text-forest-800'
                            : a.status === 'half-day'
                              ? 'bg-flame-50 text-flame-700'
                              : 'bg-[#FDECEC] text-danger',
                        )}
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </td>
                    <td className="td tnum text-right text-sm font-bold">
                      {a.status === 'leave' ? '—' : formatINR(a.dailyRate)}
                    </td>
                    <td className="td text-xs text-charcoal/50">{a.recordedByName}</td>
                    {canRecord && (
                      <td className="td text-right">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-charcoal/30 transition-all hover:bg-[#FDECEC] hover:text-danger"
                          aria-label="Remove day"
                          onClick={() => void removeDay(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {attendance && (
                  <tr className="bg-forest-50/60">
                    <td className="td text-sm font-bold text-forest-800" colSpan={2}>
                      Total wages ({attendance.workedDays} full + {attendance.halfDays} half)
                    </td>
                    <td className="td tnum text-right text-sm font-extrabold text-forest-800">
                      {formatINR(attendance.wageTotal)}
                    </td>
                    <td className="td" colSpan={canRecord ? 2 : 1}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Marking modal */}
      {open && (
        <Modal
          title="Mark attendance"
          onClose={() => setOpen(false)}
          width="max-w-sm"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={markMutation.isPending}
                onClick={saveAttendance}
              >
                {markMutation.isPending && (
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                )}
                Save
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-charcoal/55">Re-marking the same day simply corrects it.</p>
            <FormField label="Status *">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['worked', 'Worked'],
                    ['half-day', 'Half day'],
                    ['leave', 'Leave'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={cls(
                      'rounded-xl border px-3 py-2 text-sm font-semibold transition-all',
                      status === k
                        ? k === 'worked'
                          ? 'border-forest-600 bg-forest-50 text-forest-800'
                          : k === 'half-day'
                            ? 'border-flame-500 bg-flame-50 text-flame-700'
                            : 'border-danger bg-[#FDECEC] text-danger'
                        : 'border-[#e7decf] bg-white text-charcoal/55',
                    )}
                    onClick={() => pickStatus(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Date *">
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
            {status !== 'leave' && (
              <FormField
                label={status === 'half-day' ? 'Half-day wage (₹) *' : 'Daily wage (₹) *'}
                error={formError || undefined}
              >
                <input
                  type="number"
                  min={1}
                  className="input tnum"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder={status === 'half-day' ? '300' : '600'}
                />
              </FormField>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
