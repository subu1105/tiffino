import type { PaymentMethod, StatementDTO } from '@tiffino/shared';
import { formatBusinessDate, formatINR, toBusinessDate } from '@tiffino/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IndianRupee, Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deleteStatement, listPayments, listStatements } from '../../api/endpoints';
import { useCan } from '../../auth/AuthContext';
import { SettlementChip } from '../../components/Chips';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { printStatementForRecord } from '../../lib/statement-print';
import { CustomerSelect, type CustomerOption } from '../../components/CustomerSelect';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { StatCard } from '../../components/StatCard';
import { StatCardSkeleton } from '../../components/Spinner';
import type { PaymentDTO } from '@tiffino/shared';
import { RecordPaymentModal } from './RecordPaymentModal';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};

export function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canRecord = useCan('payments.record');
  const canReports = useCan('reports.view');
  const toast = useToast();
  const confirm = useConfirm();

  const statementsQuery = useQuery({
    queryKey: ['statements', 'all'],
    queryFn: () => listStatements(),
  });

  const viewStatementRecord = async (s: StatementDTO) => {
    try {
      await printStatementForRecord(s, canReports);
    } catch (err) {
      toast.apiError(err, 'Could not open the statement');
    }
  };

  const removeStatementRecord = async (s: StatementDTO) => {
    const { ok } = await confirm({
      title: 'Delete this statement record?',
      body: `${s.customerName} · ${s.periodLabel} · ${formatINR(s.periodAmount)} — this removes only the record, not any orders or payments.`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteStatement(s.id);
      void statementsQuery.refetch();
      toast.success('Statement record deleted');
    } catch (err) {
      toast.apiError(err, 'Delete failed');
    }
  };

  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const method = (searchParams.get('method') ?? '') as PaymentMethod | '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const setParam = (key: string, value: string | null, resetPage = true) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const query = useQuery({
    queryKey: ['payments', { customerId: customer?.id, method, from, to, page }],
    queryFn: () =>
      listPayments({
        customerId: customer?.id,
        method: method || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: 20,
      }),
    placeholderData: keepPreviousData,
  });

  const [recording, setRecording] = useState(false);

  const payments = query.data?.data.payments ?? [];
  const totalAmount = query.data?.data.totalAmount ?? 0;
  const meta = query.data?.meta;
  const hasFilters = !!(customer || method || from || to);

  const columns: Column<PaymentDTO>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (p) => (
        <span className="whitespace-nowrap text-sm">{formatBusinessDate(p.paymentDate)}</span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (p) => <span className="text-sm font-semibold text-charcoal">{p.customerName}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (p) => (
        <span className="tnum text-sm font-bold text-success">{formatINR(p.amount)}</span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => <span className="chip bg-forest-50 text-forest-700">{METHOD_LABELS[p.method]}</span>,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (p) => (
        <span className="block max-w-[16rem] text-sm text-charcoal/60">
          <span className="block truncate">{p.notes || '—'}</span>
          {p.statementPeriodLabel && (
            <span className="block truncate text-xs font-semibold text-forest-600">
              ⇢ settles: {p.statementPeriodLabel}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'by',
      header: 'Recorded by',
      render: (p) => <span className="text-xs text-charcoal/50">{p.recordedByName}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        actions={
          canRecord && (
            <button type="button" className="btn btn-primary" onClick={() => setRecording(true)}>
              <Plus className="h-4 w-4" /> Record Payment
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {query.isPending ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={IndianRupee}
              label={hasFilters ? 'Collected (filtered)' : 'Total Collected'}
              value={formatINR(totalAmount)}
              variant="success"
            />
            <StatCard
              icon={ReceiptText}
              label="Payments Recorded"
              value={meta?.total ?? 0}
              sub={hasFilters ? 'matching current filters' : 'all time'}
            />
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 sm:max-w-xs">
          <label className="label">Customer</label>
          <CustomerSelect
            value={customer}
            onChange={(c) => {
              setCustomer(c);
              // Changing the customer must snap back to page 1, like every other filter.
              setParam('page', null);
            }}
            placeholder="All customers"
          />
        </div>
        <div>
          <label className="label">Method</label>
          <select
            className="input w-auto py-2.5"
            value={method}
            onChange={(e) => setParam('method', e.target.value || null)}
          >
            <option value="">All methods</option>
            {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input
            type="date"
            className="input w-auto"
            value={from}
            onChange={(e) => setParam('from', e.target.value || null)}
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            type="date"
            className="input w-auto"
            value={to}
            onChange={(e) => setParam('to', e.target.value || null)}
          />
        </div>
      </div>

      {query.isError ? (
        <div className="card">
          <ErrorState onRetry={() => query.refetch()} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={payments}
          rowKey={(p) => p.id}
          loading={query.isPending}
          empty={
            <EmptyState
              variant="food"
              title={hasFilters ? 'No payments match these filters' : 'No payments yet'}
              message={
                hasFilters
                  ? 'Widen the date range or clear the filters.'
                  : 'Record the first payment when a customer settles their dabba dues.'
              }
              action={
                canRecord &&
                !hasFilters && (
                  <button type="button" className="btn btn-primary" onClick={() => setRecording(true)}>
                    <Plus className="h-4 w-4" /> Record Payment
                  </button>
                )
              }
            />
          }
          renderCard={(p) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-charcoal">{p.customerName}</p>
                <p className="text-[11px] text-charcoal/45">
                  {formatBusinessDate(p.paymentDate)} · {METHOD_LABELS[p.method]}
                </p>
                {p.notes && <p className="mt-1 truncate text-xs text-charcoal/55">{p.notes}</p>}
              </div>
              <span className="tnum shrink-0 text-sm font-bold text-success">
                {formatINR(p.amount)}
              </span>
            </div>
          )}
          footer={meta && <Pagination meta={meta} onPage={(p) => setParam('page', String(p), false)} />}
        />
      )}

      {(statementsQuery.data?.length ?? 0) > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-[#f1e9dc] bg-cream/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-charcoal/55">
            Statements sent — customer-wise, compare with payments received since
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc]">
                  <th className="th">Customer</th>
                  <th className="th">Period</th>
                  <th className="th">Generated</th>
                  <th className="th text-right">Tiffins</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Pending then</th>
                  <th className="th text-right">Received after</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {statementsQuery.data!.map((s) => (
                  <tr key={s.id} className="border-b border-[#f6f0e6] last:border-b-0">
                    <td className="td text-sm font-semibold">{s.customerName}</td>
                    <td className="td text-sm">{s.periodLabel}</td>
                    <td className="td whitespace-nowrap text-sm">
                      {formatBusinessDate(toBusinessDate(new Date(s.createdAt)))}
                    </td>
                    <td className="td tnum text-right text-sm">{s.totalTiffins}</td>
                    <td className="td tnum text-right text-sm font-semibold">
                      {formatINR(s.periodAmount)}
                    </td>
                    <td className="td tnum text-right text-sm font-semibold text-warning">
                      {formatINR(s.pending)}
                    </td>
                    <td className="td tnum text-right text-sm font-semibold text-success">
                      {formatINR(s.receivedSince)}
                    </td>
                    <td className="td">
                      <SettlementChip status={s.settlementStatus} />
                    </td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void viewStatementRecord(s)}
                        >
                          View
                        </button>
                        {canRecord && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-danger"
                            onClick={() => void removeStatementRecord(s)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recording && <RecordPaymentModal onClose={() => setRecording(false)} />}
    </div>
  );
}
