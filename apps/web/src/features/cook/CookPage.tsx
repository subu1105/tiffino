import {
  buildCookInvoiceHtml,
  createCookEntrySchema,
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  todayBusinessDate,
  type CookEntryDTO,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ChefHat, FileDown, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { fieldErrorsFromDetails, isApiError } from '../../api/client';
import { addCookEntry, deleteCookEntry, getCookLedger } from '../../api/endpoints';
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
type Kind = 'paid' | 'return';

/** Cook invoice: money handed to the cook, amounts returned, running net. */
export function CookPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canRecord = useCan('expenses.record');
  const today = todayBusinessDate();

  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const range = rangeKey === 'all' ? null : rangeForFilter(rangeKey);

  const ledgerQuery = useQuery({
    queryKey: ['cook-ledger', range?.from ?? 'all', range?.to ?? 'all'],
    queryFn: () => getCookLedger(range?.from, range?.to),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['cook-ledger'] });

  /* ---------------- add modal ---------------- */

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>('paid');
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: async (keepOpen: boolean) => {
      const parsed = createCookEntrySchema.safeParse({
        entryDate,
        kind,
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
      return addCookEntry(parsed.data).then((e) => ({ e, keepOpen }));
    },
    onSuccess: ({ e, keepOpen }) => {
      invalidate();
      toast.success(
        e.kind === 'paid' ? `Paid ${formatINR(e.amount)} to the cook` : `Cook returned ${formatINR(e.amount)}`,
      );
      setAmount('');
      setNotes('');
      setErrors({});
      if (!keepOpen) setAdding(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'VALIDATION_ERROR')) setErrors(fieldErrorsFromDetails(err.details));
      else toast.apiError(err, 'Could not save the entry');
    },
  });

  const removeEntry = async (e: CookEntryDTO) => {
    const { ok } = await confirm({
      title: 'Delete this entry?',
      body: `${formatBusinessDate(e.entryDate)} · ${e.kind === 'paid' ? 'Paid' : 'Return'} · ${formatINR(e.amount)}`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteCookEntry(e.id);
      invalidate();
      toast.success('Entry deleted');
    } catch (err) {
      toast.apiError(err, 'Delete failed');
    }
  };

  const ledger = ledgerQuery.data;

  const printPdf = () => {
    if (!ledger) return;
    try {
      const periodLabel = range
        ? `${formatBusinessDate(range.from)} – ${formatBusinessDate(range.to)}`
        : 'All time';
      openPrintWindow(buildCookInvoiceHtml({ periodLabel, ...ledger }));
    } catch (err) {
      toast.apiError(err, 'Could not open the PDF window');
    }
  };

  return (
    <div>
      <PageHeader
        title="Cook Invoice"
        subtitle={
          range ? `${formatBusinessDate(range.from)} – ${formatBusinessDate(range.to)}` : 'All time'
        }
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!ledger}
              onClick={printPdf}
              title="Open a print window — choose 'Save as PDF'"
            >
              <FileDown className="h-4 w-4" /> PDF
            </button>
            {canRecord && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setKind('paid');
                  setEntryDate(today);
                  setAdding(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add entry
              </button>
            )}
          </>
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

      {/* Totals */}
      {ledgerQuery.isPending ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : ledger ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={ArrowUpRight} label="Paid to cook" value={formatINR(ledger.totalPaid)} />
          <StatCard
            icon={ArrowDownLeft}
            label="Returned by cook"
            value={formatINR(ledger.totalReturned)}
          />
          <StatCard icon={ChefHat} label="Net total" value={formatINR(ledger.net)} variant="flame" />
        </div>
      ) : null}

      {/* Ledger table */}
      <div className="card overflow-hidden">
        {ledgerQuery.isPending ? (
          <ListSkeleton />
        ) : ledgerQuery.isError ? (
          <ErrorState onRetry={() => ledgerQuery.refetch()} />
        ) : (ledger?.entries.length ?? 0) === 0 ? (
          <EmptyState
            variant="pot"
            title="No entries yet"
            message="Log what you hand to the cook — and what comes back."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc] bg-cream/70">
                  <th className="th">Date</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Notes</th>
                  <th className="th">Recorded by</th>
                  {canRecord && <th className="th text-right"></th>}
                </tr>
              </thead>
              <tbody>
                {ledger!.entries.map((e) => (
                  <tr key={e.id} className="border-b border-[#f6f0e6] last:border-b-0">
                    <td className="td whitespace-nowrap text-sm">
                      {formatBusinessDate(e.entryDate)}
                    </td>
                    <td className="td">
                      <span
                        className={cls(
                          'chip',
                          e.kind === 'paid'
                            ? 'bg-flame-50 text-flame-700'
                            : 'bg-emerald-50 text-success',
                        )}
                      >
                        {e.kind === 'paid' ? 'Paid' : 'Return'}
                      </span>
                    </td>
                    <td
                      className={cls(
                        'td tnum text-right text-sm font-bold',
                        e.kind === 'return' && 'text-success',
                      )}
                    >
                      {e.kind === 'return' ? '−' : ''}
                      {formatINR(e.amount)}
                    </td>
                    <td className="td max-w-[14rem] truncate text-sm text-charcoal/60">
                      {e.notes || '—'}
                    </td>
                    <td className="td text-xs text-charcoal/50">{e.recordedByName}</td>
                    {canRecord && (
                      <td className="td text-right">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-charcoal/30 transition-all hover:bg-[#FDECEC] hover:text-danger"
                          aria-label="Delete entry"
                          onClick={() => void removeEntry(e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {ledger && (
                  <tr className="bg-forest-50/60">
                    <td className="td text-sm font-bold text-forest-800" colSpan={2}>
                      Net total (Paid − Return)
                    </td>
                    <td className="td tnum text-right text-sm font-extrabold text-forest-800">
                      {formatINR(ledger.net)}
                    </td>
                    <td className="td" colSpan={canRecord ? 3 : 2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add-entry modal */}
      {adding && (
        <Modal
          title={kind === 'paid' ? 'Paid to cook' : 'Return from cook'}
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
                form="cook-entry-form"
                className="btn btn-primary"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && (
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                )}
                Save entry
              </button>
            </>
          }
        >
          <form
            id="cook-entry-form"
            className="space-y-4"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              saveMutation.mutate(false);
            }}
          >
            <FormField label="Type *">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['paid', 'Paid to cook'],
                    ['return', 'Return from cook'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={cls(
                      'rounded-xl border px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
                      kind === k
                        ? k === 'paid'
                          ? 'border-flame-500 bg-flame-50 text-flame-700'
                          : 'border-forest-600 bg-forest-50 text-forest-800'
                        : 'border-[#e7decf] bg-white text-charcoal/55 hover:border-forest-300',
                    )}
                    onClick={() => setKind(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Date *" error={errors.entryDate}>
                <input
                  type="date"
                  className="input"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </FormField>
              <FormField label="Amount (₹) *" error={errors.amount}>
                <input
                  type="number"
                  min={1}
                  className="input tnum"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500"
                  autoFocus
                />
              </FormField>
            </div>
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
