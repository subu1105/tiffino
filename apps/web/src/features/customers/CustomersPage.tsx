import type { CustomerDTO, CustomerStatus, CustomerType, OrderStatus } from '@tiffino/shared';
import { formatINR } from '@tiffino/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, UserCheck, UserX, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listCustomers, setCustomerStatus } from '../../api/endpoints';
import { useCanFn } from '../../auth/AuthContext';
import { ActiveBadge, StatusBadge, TypeChip } from '../../components/Chips';
import { useConfirm } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { RowMenu } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';
import { useDebounced } from '../../lib/useDebounced';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';
import { CustomerFormModal } from './CustomerFormModal';

function TodayDot({ status }: { status: OrderStatus | null | undefined }) {
  if (!status) return <span className="text-sm text-charcoal/30">—</span>;
  return <StatusBadge status={status} />;
}

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const can = useCanFn();
  const queryClient = useQueryClient();

  const type = (searchParams.get('type') ?? '') as CustomerType | '';
  const status = (searchParams.get('status') ?? 'active') as CustomerStatus | 'all';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

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

  useEffect(() => {
    setParam('q', q || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useQuery({
    queryKey: ['customers', { q, type, status, page }],
    queryFn: () =>
      listCustomers({
        q,
        type: type || undefined,
        status: status === 'all' ? undefined : status,
        page,
        limit: 20,
        todayStatus: '1',
      }),
    placeholderData: keepPreviousData,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomerDTO | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<CustomerDTO | null>(null);

  const statusMutation = useMutation({
    mutationFn: (vars: { customer: CustomerDTO; status: CustomerStatus }) =>
      setCustomerStatus(vars.customer.id, vars.status),
    onSuccess: (_c, vars) => {
      toast.success(
        vars.status === 'inactive'
          ? `${vars.customer.fullName} deactivated`
          : `${vars.customer.fullName} reactivated`,
      );
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer'] });
      void queryClient.invalidateQueries({ queryKey: ['sheet'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.apiError(err, 'Could not change status'),
  });

  const handleToggleStatus = async (customer: CustomerDTO) => {
    const deactivating = customer.status === 'active';
    const { ok } = await confirm({
      title: deactivating ? `Deactivate ${customer.fullName}?` : `Reactivate ${customer.fullName}?`,
      body: deactivating
        ? 'They disappear from the daily booking sheet, but every order and payment stays in their history.'
        : 'They come back on the daily booking sheet from today.',
      tone: deactivating ? 'danger' : 'primary',
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
    });
    if (ok) statusMutation.mutate({ customer, status: deactivating ? 'inactive' : 'active' });
  };

  const canManage = can('customers.manage');
  const canPay = can('payments.record');

  const rowMenu = (c: CustomerDTO) => {
    const items = [];
    if (canManage) {
      items.push({
        label: c.status === 'active' ? 'Deactivate…' : 'Reactivate…',
        icon: c.status === 'active' ? UserX : UserCheck,
        tone: c.status === 'active' ? ('danger' as const) : ('default' as const),
        onSelect: () => void handleToggleStatus(c),
      });
    }
    if (canPay && c.status === 'active') {
      items.push({
        label: 'Record payment…',
        icon: Wallet,
        onSelect: () => setPayingCustomer(c),
      });
    }
    return items;
  };

  const columns: Column<CustomerDTO>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (c) => (
        <div>
          <span className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            {c.fullName}
            {c.status === 'inactive' && <ActiveBadge active={false} />}
          </span>
          <a
            href={`tel:${c.mobile}`}
            onClick={(e) => e.stopPropagation()}
            className="tnum text-[11px] text-forest-600 hover:underline"
          >
            {c.mobile}
          </a>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (c) => <TypeChip type={c.type} /> },
    {
      key: 'breakfast',
      header: 'Breakfast ₹',
      className: 'text-right',
      render: (c) => (
        <span className="tnum font-semibold">
          {c.breakfastPrice > 0 ? formatINR(c.breakfastPrice) : '—'}
        </span>
      ),
    },
    {
      key: 'lunch',
      header: 'Lunch ₹',
      className: 'text-right',
      render: (c) => <span className="tnum font-semibold">{formatINR(c.lunchPrice)}</span>,
    },
    {
      key: 'dinner',
      header: 'Dinner ₹',
      className: 'text-right',
      render: (c) => <span className="tnum font-semibold">{formatINR(c.dinnerPrice)}</span>,
    },
    {
      key: 'todayB',
      header: "Today's Breakfast",
      render: (c) => <TodayDot status={c.todayBreakfast} />,
    },
    { key: 'todayL', header: "Today's Lunch", render: (c) => <TodayDot status={c.todayLunch} /> },
    { key: 'todayD', header: "Today's Dinner", render: (c) => <TodayDot status={c.todayDinner} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canManage && (
            <button
              type="button"
              aria-label={`Edit ${c.fullName}`}
              className="rounded-lg p-1.5 text-charcoal/45 transition-all hover:bg-forest-50 hover:text-forest-700"
              onClick={() => setEditing(c)}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <RowMenu items={rowMenu(c)} />
        </div>
      ),
    },
  ];

  const meta = query.data?.meta;
  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title={<>Customers{meta ? <span className="tnum text-charcoal/40"> ({meta.total})</span> : null}</>}
        actions={
          canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add Customer
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/35" />
          <input
            className="input pl-9"
            placeholder="Search name / mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-full border border-[#e7decf] bg-white p-1 shadow-sm">
          {([
            ['', 'All'],
            ['regular', 'Regular'],
            ['occasional', 'Occasional'],
          ] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={cls(
                'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                type === value
                  ? 'bg-forest-800 text-white shadow-sm'
                  : 'text-charcoal/55 hover:bg-forest-50 hover:text-forest-800',
              )}
              onClick={() => setParam('type', value || null)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Status filter"
          className="input w-auto py-2 text-sm font-semibold"
          value={status}
          onChange={(e) => setParam('status', e.target.value === 'active' ? null : e.target.value)}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
      </div>

      {query.isError ? (
        <div className="card">
          <ErrorState onRetry={() => query.refetch()} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={query.isPending}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          empty={
            <EmptyState
              variant={q ? 'search' : 'food'}
              title={q ? `No customers match “${q}”` : 'No customers yet'}
              message={
                q
                  ? 'Try a different name or mobile number.'
                  : 'Your tiffin family starts here — add the first customer.'
              }
              action={
                !q &&
                canManage && (
                  <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" /> Add Customer
                  </button>
                )
              }
            />
          }
          renderCard={(c) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                  {c.fullName}
                  {c.status === 'inactive' && <ActiveBadge active={false} />}
                </p>
                <p className="tnum text-[11px] text-charcoal/45">{c.mobile}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <TypeChip type={c.type} />
                  <span className="tnum font-semibold text-charcoal/70">
                    L {formatINR(c.lunchPrice)} · D {formatINR(c.dinnerPrice)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-charcoal/50">
                  <span>Today:</span>
                  <TodayDot status={c.todayLunch} />
                  <TodayDot status={c.todayDinner} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Edit ${c.fullName}`}
                    className="rounded-lg p-1.5 text-charcoal/45 hover:bg-forest-50 hover:text-forest-700"
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <RowMenu items={rowMenu(c)} />
              </div>
            </div>
          )}
          footer={meta && <Pagination meta={meta} onPage={(p) => setParam('page', String(p), false)} />}
        />
      )}

      {adding && <CustomerFormModal onClose={() => setAdding(false)} />}
      {editing && <CustomerFormModal customer={editing} onClose={() => setEditing(null)} />}
      {payingCustomer && (
        <RecordPaymentModal
          customer={{
            id: payingCustomer.id,
            fullName: payingCustomer.fullName,
            mobile: payingCustomer.mobile,
          }}
          onClose={() => setPayingCustomer(null)}
        />
      )}
    </div>
  );
}
