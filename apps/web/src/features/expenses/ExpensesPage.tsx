import type { DashboardFilter } from '@tiffino/shared';
import {
  createExpenseSchema,
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  todayBusinessDate,
  type DateRange,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { fieldErrorsFromDetails, isApiError } from '../../api/client';
import {
  addExpense,
  deleteExpense,
  exportExpensesCsv,
  getExpenseBook,
  getProfitLoss,
} from '../../api/endpoints';
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

type RangeKey = DashboardFilter | 'custom';

/** The kharcha book + profit & loss, on one page. */
export function ExpensesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canRecord = useCan('expenses.record');
  const today = todayBusinessDate();

  const [rangeKey, setRangeKey] = useState<RangeKey>('this-week');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const range: DateRange =
    rangeKey === 'custom'
      ? { from: customFrom <= customTo ? customFrom : customTo, to: customFrom <= customTo ? customTo : customFrom }
      : rangeForFilter(rangeKey);

  const bookQuery = useQuery({
    queryKey: ['expenses', 'book', range.from, range.to],
    queryFn: () => getExpenseBook(range.from, range.to),
  });
  const pnlQuery = useQuery({
    queryKey: ['profit-loss', range.from, range.to],
    queryFn: () => getProfitLoss({ from: range.from, to: range.to }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
  };

  /* ---------------- add modal ---------------- */

  const [adding, setAdding] = useState(false);
  const [expenseDate, setExpenseDate] = useState(today);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: async (keepOpen: boolean) => {
      const parsed = createExpenseSchema.safeParse({
        expenseDate,
        item: item.trim(),
        amount: amount.trim() === '' ? undefined : Number(amount),
        notes: notes.trim(),
      });
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          if (key && !(key in next)) next[key] = issue.message;
        }
        setErrors(next);
        throw new Error('validation');
      }
      return addExpense(parsed.data).then((e) => ({ e, keepOpen }));
    },
    onSuccess: ({ e, keepOpen }) => {
      invalidate();
      toast.success(`${e.item} — ${formatINR(e.amount)}`, 'Expense added');
      setItem('');
      setAmount('');
      setNotes('');
      setErrors({});
      if (!keepOpen) setAdding(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'VALIDATION_ERROR')) setErrors(fieldErrorsFromDetails(err.details));
      else toast.apiError(err, 'Could not add the expense');
    },
  });

  const removeExpense = async (id: string, label: string, value: number) => {
    const { ok } = await confirm({
      title: 'Delete this expense?',
      body: `${label} · ${formatINR(value)}`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteExpense(id);
      invalidate();
      toast.success('Expense deleted');
    } catch (err) {
      toast.apiError(err, 'Delete failed');
    }
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportExpensesCsv(range.from, range.to);
      const filename = `tiffino-expenses-${range.from}-to-${range.to}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Expenses exported', filename);
    } catch (err) {
      toast.apiError(err, 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const pnl = pnlQuery.data;
  const inProfit = (pnl?.profit ?? 0) >= 0;
  const days = bookQuery.data?.days ?? [];

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={`${formatBusinessDate(range.from)} – ${formatBusinessDate(range.to)}`}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              Export CSV
            </button>
            {canRecord && (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add expense
              </button>
            )}
          </>
        }
      />

      {/* Range pills */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(['today', 'yesterday', 'this-week', 'this-month'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={cls(
              'chip px-3.5 py-1.5 capitalize transition-all',
              rangeKey === f
                ? 'bg-forest-800 text-cream'
                : 'bg-white text-charcoal/60 hover:bg-forest-50',
            )}
            onClick={() => setRangeKey(f)}
          >
            {f === 'this-week' ? 'Week' : f === 'this-month' ? 'Month' : f.replace('-', ' ')}
          </button>
        ))}
        <span className="ml-2 flex items-center gap-1.5 text-sm text-charcoal/50">
          <input
            type="date"
            className="input w-auto py-1.5"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value);
              setRangeKey('custom');
            }}
          />
          –
          <input
            type="date"
            className="input w-auto py-1.5"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value);
              setRangeKey('custom');
            }}
          />
        </span>
      </div>

      {/* P&L tiles */}
      {pnlQuery.isPending ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : pnl ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={TrendingUp} label="Tiffin revenue" value={formatINR(pnl.revenue)} />
          <StatCard
            icon={Wallet}
            label="Expenses"
            value={formatINR(pnl.expense)}
            sub={pnl.cookWage > 0 ? `incl. cook ${formatINR(pnl.cookWage)}` : undefined}
          />
          <StatCard
            icon={inProfit ? TrendingUp : TrendingDown}
            label={inProfit ? 'Profit' : 'Loss'}
            value={`${inProfit ? '+' : '−'}${formatINR(Math.abs(pnl.profit))}`}
            variant={inProfit ? 'default' : 'warning'}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* The kharcha book */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-charcoal/55">
            Expense book — total {formatINR(bookQuery.data?.grandTotal ?? 0)}
          </h2>
          {bookQuery.isPending ? (
            <div className="card overflow-hidden">
              <ListSkeleton />
            </div>
          ) : bookQuery.isError ? (
            <ErrorState onRetry={() => bookQuery.refetch()} />
          ) : days.length === 0 ? (
            <div className="card overflow-hidden">
              <EmptyState
                variant="pot"
                title="No expenses in this range"
                message="Add today's expenses with the button above."
                compact
              />
            </div>
          ) : (
            <div className="space-y-3">
              {days.map((day) => (
                <div key={day.date} className="card overflow-hidden">
                  <div className="flex items-center justify-between bg-forest-50 px-4 py-2">
                    <span className="text-sm font-bold text-forest-800">
                      {formatBusinessDate(day.date)}
                    </span>
                    <span className="tnum text-sm font-bold text-forest-800">
                      {formatINR(day.total)}
                    </span>
                  </div>
                  {day.items.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center border-t border-[#f6f0e6] px-4 py-2 first:border-t-0"
                    >
                      <div className="mr-2 min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-charcoal">{e.item}</p>
                        {e.notes && (
                          <p className="truncate text-xs text-charcoal/45">{e.notes}</p>
                        )}
                      </div>
                      <span className="tnum mr-2 text-sm font-semibold">{formatINR(e.amount)}</span>
                      {canRecord && (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-charcoal/30 transition-all hover:bg-[#FDECEC] hover:text-danger"
                          aria-label={`Delete ${e.item}`}
                          onClick={() => void removeExpense(e.id, e.item, e.amount)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Day-by-day P&L */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-charcoal/55">
            Profit & loss — day by day
          </h2>
          <div className="card overflow-hidden">
            {pnlQuery.isPending ? (
              <ListSkeleton />
            ) : pnlQuery.isError ? (
              <ErrorState onRetry={() => pnlQuery.refetch()} />
            ) : (
              (() => {
                const active = (pnl?.byDate ?? []).filter((p) => p.revenue > 0 || p.expense > 0);
                if (active.length === 0) {
                  return (
                    <EmptyState
                      variant="food"
                      title="Nothing in this range"
                      message="No bookings or expenses on these dates."
                      compact
                    />
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#f1e9dc] bg-cream/70">
                          <th className="th">Date</th>
                          <th className="th text-right">Revenue</th>
                          <th className="th text-right">Expense</th>
                          <th className="th text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.map((p) => (
                          <tr key={p.date} className="border-b border-[#f6f0e6] last:border-b-0">
                            <td className="td whitespace-nowrap text-sm">
                              {formatBusinessDate(p.date)}
                            </td>
                            <td className="td tnum text-right text-sm text-success">
                              {formatINR(p.revenue)}
                            </td>
                            <td className="td tnum text-right text-sm text-danger">
                              {formatINR(p.expense)}
                            </td>
                            <td
                              className={cls(
                                'td tnum text-right text-sm font-bold',
                                p.profit >= 0 ? 'text-forest-700' : 'text-danger',
                              )}
                            >
                              {p.profit >= 0 ? '+' : '−'}
                              {formatINR(Math.abs(p.profit))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Add-expense modal */}
      {adding && (
        <Modal
          title="Add expense"
          onClose={() => setAdding(false)}
          width="max-w-md"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate(true)}
              >
                Save + add more
              </button>
              <button
                type="submit"
                form="add-expense-form"
                className="btn btn-primary"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && (
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                )}
                Save expense
              </button>
            </>
          }
        >
          <form
            id="add-expense-form"
            className="space-y-4"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              saveMutation.mutate(false);
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Date *" error={errors.expenseDate}>
                <input
                  type="date"
                  className="input"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </FormField>
              <FormField label="Amount (₹) *" error={errors.amount}>
                <input
                  type="number"
                  min={1}
                  className="input tnum"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="400"
                />
              </FormField>
            </div>
            <FormField label="Item *" error={errors.item}>
              <input
                className="input"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="e.g. Sabzi mandi, Gas cylinder, Atta…"
                maxLength={80}
                autoFocus
              />
            </FormField>
            <FormField label="Notes" error={errors.notes}>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
                maxLength={300}
              />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  );
}
