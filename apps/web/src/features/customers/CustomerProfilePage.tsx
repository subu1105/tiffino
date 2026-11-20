import type { CustomerStatus, MealType, OrderStatus, PaymentMethod, StatementDTO } from '@tiffino/shared';
import { buildStatementHtml, formatBusinessDate, formatINR, toBusinessDate } from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Coffee,
  CalendarDays,
  History,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Sun,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  createStatement,
  deleteStatement,
  getCustomer,
  getCustomerOrdersReport,
  getCustomerPayments,
  getCustomerPrices,
  listOrders,
  listStatements,
  setCustomerStatus,
} from '../../api/endpoints';
import { printStatementForRecord } from '../../lib/statement-print';
import { useCanFn } from '../../auth/AuthContext';
import { ActiveBadge, MealChip, SettlementChip, StatusBadge, TypeChip } from '../../components/Chips';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListSkeleton, Skeleton, StatCardSkeleton } from '../../components/Spinner';
import { StatCard } from '../../components/StatCard';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';
import { CustomerFormModal } from './CustomerFormModal';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};

type Tab = 'bookings' | 'payments' | 'prices';

export function CustomerProfilePage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') ?? 'bookings') as Tab;
  const toast = useToast();
  const confirm = useConfirm();
  const can = useCanFn();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);

  const query = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: CustomerStatus) => setCustomerStatus(id, status),
    onSuccess: (_c, status) => {
      toast.success(status === 'inactive' ? 'Customer deactivated' : 'Customer reactivated');
      void queryClient.invalidateQueries({ queryKey: ['customer', id] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['sheet'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.apiError(err, 'Could not change status'),
  });

  if (query.isError) {
    return (
      <div className="card">
        <ErrorState title="Could not load this customer" onRetry={() => query.refetch()} />
      </div>
    );
  }

  const customer = query.data?.customer;
  const stats = query.data?.stats;

  const setTab = (next: Tab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'bookings') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  const handleToggleStatus = async () => {
    if (!customer) return;
    const deactivating = customer.status === 'active';
    const { ok } = await confirm({
      title: deactivating ? `Deactivate ${customer.fullName}?` : `Reactivate ${customer.fullName}?`,
      body: deactivating
        ? 'They disappear from the daily booking sheet, but every order and payment stays in this history.'
        : 'They come back on the daily booking sheet from today.',
      tone: deactivating ? 'danger' : 'primary',
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
    });
    if (ok) statusMutation.mutate(deactivating ? 'inactive' : 'active');
  };

  const TABS: Array<{ key: Tab; label: string; icon: typeof History }> = [
    { key: 'bookings', label: 'Bookings', icon: CalendarDays },
    { key: 'payments', label: 'Payments', icon: Wallet },
    { key: 'prices', label: 'Price History', icon: History },
  ];

  return (
    <div>
      <Link
        to="/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      {/* Header card */}
      {query.isPending || !customer ? (
        <div className="card p-6">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-3 h-4 w-80" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
      ) : (
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl font-bold text-charcoal">{customer.fullName}</h1>
                <TypeChip type={customer.type} />
                <ActiveBadge active={customer.status === 'active'} />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-charcoal/60">
                <a
                  href={`tel:${customer.mobile}`}
                  className="tnum inline-flex items-center gap-1.5 font-semibold text-forest-700 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" /> {customer.mobile}
                </a>
                {customer.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {customer.address}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Joined{' '}
                  {formatBusinessDate(customer.joiningDate)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {customer.breakfastPrice > 0 && (
                  <span className="tnum inline-flex items-center gap-1.5 font-semibold text-charcoal/75">
                    <Coffee className="h-4 w-4 text-charcoal/50" /> Breakfast{' '}
                    {formatINR(customer.breakfastPrice)}
                  </span>
                )}
                <span className="tnum inline-flex items-center gap-1.5 font-semibold text-forest-800">
                  <Sun className="h-4 w-4 text-forest-600" /> Lunch {formatINR(customer.lunchPrice)}
                </span>
                <span className="tnum inline-flex items-center gap-1.5 font-semibold text-flame-700">
                  <Moon className="h-4 w-4 text-flame-500" /> Dinner {formatINR(customer.dinnerPrice)}
                </span>
                {customer.notes && (
                  <span className="inline-flex items-center gap-1.5 text-charcoal/55">
                    <StickyNote className="h-3.5 w-3.5" /> {customer.notes}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {can('customers.manage') && (
                <>
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    type="button"
                    className={cls('btn', customer.status === 'active' ? 'btn-danger' : 'btn-primary')}
                    onClick={() => void handleToggleStatus()}
                    disabled={statusMutation.isPending}
                  >
                    {customer.status === 'active' ? (
                      <>
                        <UserX className="h-4 w-4" /> Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4" /> Reactivate
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!stats ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={Sun} label="Total Lunches" value={stats.totalLunchOrders} />
            <StatCard icon={Moon} label="Total Dinners" value={stats.totalDinnerOrders} variant="flame" />
            <StatCard
              icon={Wallet}
              label="Total Billed"
              value={formatINR(stats.totalBilled)}
              sub={`${stats.cancelledOrders} cancelled orders excluded`}
            />
            <StatCard
              icon={Wallet}
              label="Pending"
              value={formatINR(stats.pending)}
              variant={stats.pending > 0 ? 'warning' : 'success'}
              sub={`Paid ${formatINR(stats.totalPaid)}`}
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-[#eadfce]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={cls(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
              tab === key
                ? 'border-flame-500 text-charcoal'
                : 'border-transparent text-charcoal/50 hover:text-charcoal',
            )}
            onClick={() => setTab(key)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'bookings' && <BookingsTab customerId={id} />}
        {tab === 'payments' && customer && (
          <PaymentsTab
            customerId={id}
            customer={{ fullName: customer.fullName, mobile: customer.mobile, type: customer.type }}
            canRecord={can('payments.record') && customer.status === 'active'}
            onRecord={() => setRecordingPayment(true)}
          />
        )}
        {tab === 'prices' && <PriceHistoryTab customerId={id} />}
      </div>

      {editing && customer && (
        <CustomerFormModal customer={customer} onClose={() => setEditing(false)} />
      )}
      {recordingPayment && customer && (
        <RecordPaymentModal
          customer={{ id: customer.id, fullName: customer.fullName, mobile: customer.mobile }}
          onClose={() => setRecordingPayment(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BookingsTab({ customerId }: { customerId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mealType, setMealType] = useState<MealType | ''>('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const can = useCanFn();
  // The reports endpoint needs reports.view; typical staff only hold orders.view,
  // so fall back to the plain orders list (same rows, totals computed locally).
  const canReports = can('reports.view');

  const query = useQuery({
    queryKey: ['customer-orders', customerId, { from, to, mealType, status, canReports }],
    queryFn: async () => {
      const params = {
        customerId,
        from: from || undefined,
        to: to || undefined,
        mealType: mealType || undefined,
        status: status || undefined,
      };
      if (canReports) return getCustomerOrdersReport(params);
      const res = await listOrders({ ...params, limit: 100 });
      const active = res.data.filter((o) => o.status !== 'cancelled');
      return {
        orders: res.data,
        totalOrders: active.length,
        totalAmount: active.reduce((sum, o) => sum + o.price, 0),
      };
    },
    enabled: !!customerId,
  });

  const orders = query.data?.orders ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Meal</label>
          <select className="input w-auto py-2.5" value={mealType} onChange={(e) => setMealType(e.target.value as MealType | '')}>
            <option value="">All meals</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input w-auto py-2.5" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">All statuses</option>
            <option value="booked">Booked</option>
            <option value="prepared">Prepared</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {query.data && (
          <p className="tnum ml-auto pb-2 text-sm text-charcoal/55">
            {query.data.totalOrders} orders · {formatINR(query.data.totalAmount)}
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            variant="pot"
            title="No bookings in this range"
            message="Try widening the dates or clearing the filters."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc] bg-cream/70">
                  <th className="th">Date</th>
                  <th className="th">Meal</th>
                  <th className="th text-right">Price</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const cancelled = o.status === 'cancelled';
                  return (
                    <tr
                      key={o.id}
                      className={cls(
                        'border-b border-[#f6f0e6] last:border-b-0',
                        cancelled && 'text-charcoal/40',
                      )}
                    >
                      <td className={cls('td whitespace-nowrap text-sm', cancelled && 'line-through')}>
                        {formatBusinessDate(o.orderDate)}
                      </td>
                      <td className="td">
                        <MealChip meal={o.mealType} className={cancelled ? 'opacity-50' : undefined} />
                      </td>
                      <td
                        className={cls(
                          'td tnum text-right text-sm font-semibold',
                          cancelled && 'line-through',
                        )}
                        title={o.priceOverridden ? 'Booked at a custom price' : undefined}
                      >
                        {formatINR(o.price)}
                        {o.priceOverridden && <span className="ml-1 text-flame-600">*</span>}
                      </td>
                      <td className="td">
                        <StatusBadge status={o.status} />
                        {cancelled && o.cancellationReason && (
                          <span className="ml-2 text-xs italic text-charcoal/40">
                            {o.cancellationReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PaymentsTab({
  customerId,
  customer,
  canRecord,
  onRecord,
}: {
  customerId: string;
  customer: { fullName: string; mobile: string; type: string };
  canRecord: boolean;
  onRecord: () => void;
}) {
  const can = useCanFn();
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const query = useQuery({
    queryKey: ['customer-payments', customerId],
    queryFn: () => getCustomerPayments(customerId),
    enabled: !!customerId,
  });

  const balance = query.data?.balance;
  const payments = query.data?.payments ?? [];

  const statementsQuery = useQuery({
    queryKey: ['statements', customerId],
    queryFn: () => listStatements(customerId),
    enabled: !!customerId,
  });
  const confirm = useConfirm();

  const viewStatementRecord = async (s: StatementDTO) => {
    try {
      await printStatementForRecord(s, can('reports.view'));
    } catch (err) {
      toast.apiError(err, 'Could not open the statement');
    }
  };

  const removeStatementRecord = async (s: StatementDTO) => {
    const { ok } = await confirm({
      title: 'Delete this statement record?',
      body: `${s.periodLabel} · ${formatINR(s.periodAmount)} — this removes only the record, not any orders or payments.`,
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

  /** Opens the shared TIFFINO statement in a print window — "Save as PDF"
   *  in the print dialog produces the file to send to the customer. A
   *  StatementRecord is logged first so the payments section keeps proof. */
  const printStatement = async () => {
    const data = query.data;
    if (!data) return;
    setPrinting(true);
    try {
      const record = await createStatement({ customerId, periodLabel: 'All time' });
      void statementsQuery.refetch();
      const orders = can('reports.view')
        ? (await getCustomerOrdersReport({ customerId })).orders
        : (await listOrders({ customerId, limit: 100 })).data;
      const html = buildStatementHtml({
        customer,
        periodLabel: 'All time',
        orders,
        payments: data.payments,
        balance: {
          totalBilled: record.totalBilled,
          totalPaid: record.totalPaid,
          pending: record.pending,
        },
      });
      const win = window.open('', '_blank', 'width=820,height=900');
      if (!win) {
        toast.error('Pop-up blocked', 'Allow pop-ups for this site to print the statement.');
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } catch (err) {
      toast.apiError(err, 'Could not build the statement');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {balance && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-forest-50 py-1.5 text-forest-800">
              Billed <strong className="tnum ml-1">{formatINR(balance.totalBilled)}</strong>
            </span>
            <span className="chip bg-emerald-50 py-1.5 text-success">
              Paid <strong className="tnum ml-1">{formatINR(balance.totalPaid)}</strong>
            </span>
            <span
              className={cls(
                'chip py-1.5',
                balance.pending > 0 ? 'bg-amber-50 text-warning' : 'bg-emerald-50 text-success',
              )}
            >
              Pending <strong className="tnum ml-1">{formatINR(balance.pending)}</strong>
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Printable statement: total tiffins, amounts and payments — Save as PDF to share"
            onClick={() => void printStatement()}
            disabled={printing || !query.data}
          >
            <History className="h-4 w-4" /> {printing ? 'Preparing…' : 'Statement (PDF)'}
          </button>
          {canRecord && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onRecord}>
              <Plus className="h-4 w-4" /> Record payment
            </button>
          )}
        </div>
      </div>

      {(statementsQuery.data?.length ?? 0) > 0 && (
        <div className="card mb-4 overflow-hidden">
          <div className="border-b border-[#f1e9dc] bg-cream/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-charcoal/55">
            Statements sent — compare with payments received since
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc]">
                  <th className="th">Generated</th>
                  <th className="th">Period</th>
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
                    <td className="td whitespace-nowrap text-sm">
                      {formatBusinessDate(toBusinessDate(new Date(s.createdAt)))}
                    </td>
                    <td className="td text-sm">{s.periodLabel}</td>
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
                        {can('payments.record') && (
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

      <div className="card overflow-hidden">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : payments.length === 0 ? (
          <EmptyState
            variant="food"
            title="No payments yet"
            message="Payments recorded for this customer appear here."
            action={
              canRecord && (
                <button type="button" className="btn btn-primary" onClick={onRecord}>
                  <Plus className="h-4 w-4" /> Record payment
                </button>
              )
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc] bg-cream/70">
                  <th className="th">Date</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Method</th>
                  <th className="th">Notes</th>
                  <th className="th">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-[#f6f0e6] last:border-b-0">
                    <td className="td whitespace-nowrap text-sm">
                      {formatBusinessDate(p.paymentDate)}
                    </td>
                    <td className="td tnum text-right text-sm font-bold text-success">
                      {formatINR(p.amount)}
                    </td>
                    <td className="td">
                      <span className="chip bg-forest-50 text-forest-700">
                        {METHOD_LABELS[p.method]}
                      </span>
                    </td>
                    <td className="td max-w-[14rem] text-sm text-charcoal/60">
                      <span className="block truncate">{p.notes || '—'}</span>
                      {p.statementPeriodLabel && (
                        <span className="block truncate text-xs font-semibold text-forest-600">
                          ⇢ settles: {p.statementPeriodLabel}
                        </span>
                      )}
                    </td>
                    <td className="td text-xs text-charcoal/50">{p.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PriceHistoryTab({ customerId }: { customerId: string }) {
  const query = useQuery({
    queryKey: ['customer-prices', customerId],
    queryFn: () => getCustomerPrices(customerId),
    enabled: !!customerId,
  });

  const history = query.data?.history ?? [];

  const PriceShift = ({ prev, next }: { prev: number | null; next: number }) => (
    <span className="tnum text-sm">
      {prev !== null && prev !== next ? (
        <>
          <span className="text-charcoal/40 line-through">{formatINR(prev)}</span>
          <span className="mx-1.5 text-charcoal/30">→</span>
        </>
      ) : null}
      <span className="font-semibold text-charcoal">{formatINR(next)}</span>
    </span>
  );

  return (
    <div className="card overflow-hidden">
      {query.isPending ? (
        <ListSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : history.length === 0 ? (
        <EmptyState
          variant="food"
          title="No price changes yet"
          message="When prices are updated, every change lands here with its effective date."
          compact
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-[#f1e9dc] bg-cream/70">
                <th className="th">Effective from</th>
                <th className="th">Lunch</th>
                <th className="th">Dinner</th>
                <th className="th">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-[#f6f0e6] last:border-b-0">
                  <td className="td whitespace-nowrap text-sm font-semibold">
                    {formatBusinessDate(h.effectiveDate)}
                  </td>
                  <td className="td">
                    <PriceShift prev={h.prevLunchPrice} next={h.lunchPrice} />
                  </td>
                  <td className="td">
                    <PriceShift prev={h.prevDinnerPrice} next={h.dinnerPrice} />
                  </td>
                  <td className="td text-xs text-charcoal/50">{h.changedByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
