import type { BookingSheetRowDTO, MealType, OrderDTO } from '@tiffino/shared';
import { MEAL_TYPES, formatBusinessDate, formatINR, todayBusinessDate } from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  Coffee,
  CookingPot,
  IndianRupee,
  Moon,
  Search,
  Sun,
  User,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../../api/client';
import {
  bulkBook,
  cancelOrder,
  createOrder,
  getBookingSheet,
  updateOrderQuantity,
  updateOrderStatus,
} from '../../api/endpoints';
import { useCanFn } from '../../auth/AuthContext';
import { MealChip, StatusBadge, TypeChip } from '../../components/Chips';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { RowMenu, type MenuItem } from '../../components/Menu';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { ListSkeleton, Spinner } from '../../components/Spinner';
import { DateStrip } from '../../components/DateStrip';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';
import { useDebounced } from '../../lib/useDebounced';

function isOptimistic(order: OrderDTO): boolean {
  return order.id.startsWith('optimistic-');
}

function orderFor(row: BookingSheetRowDTO, meal: MealType): OrderDTO | null {
  return row[meal];
}

function unitPriceFor(row: BookingSheetRowDTO, meal: MealType): number {
  return meal === 'breakfast'
    ? row.customer.breakfastPrice
    : meal === 'lunch'
      ? row.customer.lunchPrice
      : row.customer.dinnerPrice;
}

/** A slot is bookable when it has no live order (none, or a cancelled one). */
function isBookable(row: BookingSheetRowDTO, meal: MealType): boolean {
  const order = orderFor(row, meal);
  return !order || order.status === 'cancelled';
}

export function DailyOrdersPage() {
  const today = todayBusinessDate();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const can = useCanFn();
  const queryClient = useQueryClient();

  const date = searchParams.get('date') ?? today;
  const mealParam = searchParams.get('meal');
  const meal: MealType =
    mealParam === 'dinner' ? 'dinner' : mealParam === 'breakfast' ? 'breakfast' : 'lunch';
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    setParam('q', q || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sheetKey = ['sheet', date, q] as const;
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () => getBookingSheet(date, q || undefined),
    placeholderData: (prev) => prev,
  });
  const rows = sheetQuery.data ?? [];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrideTarget, setOverrideTarget] = useState<BookingSheetRowDTO | null>(null);

  // Reset selection when the slot context changes.
  useEffect(() => {
    setSelected(new Set());
  }, [date, meal]);

  const counts = useMemo(() => {
    const c = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const row of rows) {
      for (const m of MEAL_TYPES) {
        const o = row[m];
        if (o && o.status !== 'cancelled') c[m] += o.quantity ?? 1;
      }
    }
    return c;
  }, [rows]);

  // A customer without a price for this meal doesn't take it — hide the row on
  // this tab. Existing bookings always stay visible, whatever the price now is.
  const visibleRows = useMemo(
    () => rows.filter((r) => orderFor(r, meal) || unitPriceFor(r, meal) > 0),
    [rows, meal],
  );

  const bookableRows = useMemo(
    () => visibleRows.filter((r) => isBookable(r, meal)),
    [visibleRows, meal],
  );
  const selectedIds = useMemo(
    () => bookableRows.filter((r) => selected.has(r.customer.id)).map((r) => r.customer.id),
    [bookableRows, selected],
  );

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['sheet'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const patchSheet = (updater: (row: BookingSheetRowDTO) => BookingSheetRowDTO) => {
    queryClient.setQueryData<BookingSheetRowDTO[]>([...sheetKey], (old) =>
      old ? old.map(updater) : old,
    );
  };

  /* ---------------- book one ---------------- */

  const bookMutation = useMutation({
    mutationFn: (vars: { row: BookingSheetRowDTO; priceOverride?: number }) =>
      createOrder({
        customerId: vars.row.customer.id,
        orderDate: date,
        mealType: meal,
        quantity: 1,
        ...(vars.priceOverride !== undefined ? { priceOverride: vars.priceOverride } : {}),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: sheetKey });
      const prev = queryClient.getQueryData<BookingSheetRowDTO[]>([...sheetKey]);
      const c = vars.row.customer;
      const optimistic: OrderDTO = {
        id: `optimistic-${c.id}-${meal}`,
        customerId: c.id,
        customerName: c.fullName,
        orderDate: date,
        mealType: meal,
        customerTypeSnapshot: c.type,
        price: vars.priceOverride ?? unitPriceFor(vars.row, meal),
        unitPrice: vars.priceOverride ?? unitPriceFor(vars.row, meal),
        quantity: 1,
        priceOverridden: vars.priceOverride !== undefined,
        status: 'booked',
        active: true,
        cancelledAt: null,
        cancellationReason: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      patchSheet((row) =>
        row.customer.id === c.id ? { ...row, [meal]: optimistic } : row,
      );
      setSelected((s) => {
        if (!s.has(c.id)) return s;
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
      return { prev };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([...sheetKey], ctx.prev);
      if (isApiError(err, 'DUPLICATE_BOOKING')) {
        toast.info('Already booked', `${vars.row.customer.fullName} already has ${meal} on this date.`);
      } else if (isApiError(err, 'CUSTOMER_INACTIVE')) {
        toast.error('Customer inactive', `${vars.row.customer.fullName} is inactive — reactivate them first.`);
      } else {
        toast.apiError(err, 'Booking failed');
      }
    },
    onSuccess: (_order, vars) => {
      toast.success(`Booked ${meal} for ${vars.row.customer.fullName}`);
    },
    onSettled: invalidateAll,
  });

  /* ---------------- quantity ---------------- */

  const qtyMutation = useMutation({
    mutationFn: (vars: { order: OrderDTO; quantity: number }) =>
      updateOrderQuantity(vars.order.id, vars.quantity),
    onSuccess: (order) => {
      toast.success(
        `${order.customerName}: ${order.quantity} tiffin${order.quantity > 1 ? 's' : ''}`,
        formatINR(order.price),
      );
    },
    onError: (err) => toast.apiError(err, 'Could not change the quantity'),
    onSettled: invalidateAll,
  });

  /* ---------------- status / cancel ---------------- */

  const statusMutation = useMutation({
    mutationFn: (vars: { order: OrderDTO; status: 'prepared' | 'delivered' }) =>
      updateOrderStatus(vars.order.id, vars.status),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: sheetKey });
      const prev = queryClient.getQueryData<BookingSheetRowDTO[]>([...sheetKey]);
      patchSheet((row) => {
        const o = orderFor(row, meal);
        return o?.id === vars.order.id ? { ...row, [meal]: { ...o, status: vars.status } } : row;
      });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([...sheetKey], ctx.prev);
      if (isApiError(err, 'INVALID_STATUS_TRANSITION')) {
        toast.info('Status already moved on', 'This order was updated elsewhere — refreshed.');
      } else {
        toast.apiError(err, 'Could not update status');
      }
    },
    onSuccess: (_o, vars) =>
      toast.success(`Marked ${vars.status} — ${vars.order.customerName}`),
    onSettled: invalidateAll,
  });

  const cancelMutation = useMutation({
    mutationFn: (vars: { order: OrderDTO; reason: string }) =>
      cancelOrder(vars.order.id, vars.reason),
    onError: (err) => {
      if (isApiError(err, 'ORDER_ALREADY_CANCELLED')) {
        toast.info('Already cancelled', 'This order was cancelled elsewhere — refreshed.');
      } else {
        toast.apiError(err, 'Could not cancel order');
      }
    },
    onSuccess: (_o, vars) =>
      toast.success(`Cancelled ${meal} for ${vars.order.customerName}`),
    onSettled: invalidateAll,
  });

  /* ---------------- bulk ---------------- */

  const bulkMutation = useMutation({
    mutationFn: (vars: { mode: 'all-regular' | 'selected'; customerIds?: string[] }) =>
      bulkBook({
        orderDate: date,
        mealType: meal,
        mode: vars.mode,
        ...(vars.customerIds ? { customerIds: vars.customerIds } : {}),
      }),
    onSuccess: (result) => {
      const skippedNames = result.skippedCustomers.map((s) => s.fullName);
      const preview = skippedNames.slice(0, 6).join(', ');
      const extra = skippedNames.length > 6 ? ` +${skippedNames.length - 6} more` : '';
      toast.success(
        `Booked ${result.booked} · Skipped ${result.skipped}`,
        result.skipped > 0 ? `Skipped: ${preview}${extra}` : undefined,
      );
      setSelected(new Set());
    },
    onError: (err) => toast.apiError(err, 'Bulk booking failed'),
    onSettled: invalidateAll,
  });

  const handleBookAllRegular = async () => {
    const { ok } = await confirm({
      title: 'Book all regular customers?',
      body: (
        <>
          Book <strong className="capitalize">{meal}</strong> for every active regular customer on{' '}
          <strong>{formatBusinessDate(date)}</strong>? Customers already booked are skipped.
        </>
      ),
      tone: 'flame',
      confirmLabel: `Book all regular — ${meal}`,
    });
    if (ok) bulkMutation.mutate({ mode: 'all-regular' });
  };

  const handleBookSelected = async () => {
    if (selectedIds.length === 0) return;
    const { ok } = await confirm({
      title: `Book ${selectedIds.length} selected?`,
      body: (
        <>
          Book <strong className="capitalize">{meal}</strong> for {selectedIds.length} selected
          customer{selectedIds.length > 1 ? 's' : ''} on <strong>{formatBusinessDate(date)}</strong>?
        </>
      ),
      tone: 'flame',
      confirmLabel: `Book ${selectedIds.length} for ${meal}`,
    });
    if (ok) bulkMutation.mutate({ mode: 'selected', customerIds: selectedIds });
  };

  const handleCancel = async (order: OrderDTO) => {
    const { ok, value } = await confirm({
      title: 'Cancel this order?',
      body: (
        <>
          Cancel <strong className="capitalize">{order.mealType}</strong> for{' '}
          <strong>{order.customerName}</strong> on {formatBusinessDate(order.orderDate)}? The slot
          frees up for rebooking.
        </>
      ),
      tone: 'danger',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep it',
      input: { label: 'Reason (optional)', placeholder: 'e.g. customer travelling' },
    });
    if (ok) cancelMutation.mutate({ order, reason: value });
  };

  /* ---------------- row menu ---------------- */

  const menuItemsFor = (row: BookingSheetRowDTO): MenuItem[] => {
    const order = orderFor(row, meal);
    const items: MenuItem[] = [];
    const live = order && order.status !== 'cancelled' && !isOptimistic(order);

    if (live && can('orders.updateStatus')) {
      if (order.status === 'booked') {
        items.push({
          label: 'Mark prepared',
          icon: CookingPot,
          onSelect: () => statusMutation.mutate({ order, status: 'prepared' }),
        });
      }
      if (order.status === 'booked' || order.status === 'prepared') {
        items.push({
          label: 'Mark delivered',
          icon: Check,
          onSelect: () => statusMutation.mutate({ order, status: 'delivered' }),
        });
      }
    }
    if (isBookable(row, meal) && can('orders.overridePrice') && can('orders.book')) {
      items.push({
        label: 'Book at custom price…',
        icon: IndianRupee,
        onSelect: () => setOverrideTarget(row),
      });
    }
    // Same customer taking 2+ tiffins of the same meal: tweak the quantity.
    if (live && order.status !== 'delivered' && can('orders.book')) {
      const qn = order.quantity ?? 1;
      items.push({
        label: `+1 tiffin (now ${qn})`,
        icon: Zap,
        onSelect: () => qtyMutation.mutate({ order, quantity: qn + 1 }),
      });
      if (qn > 1) {
        items.push({
          label: `−1 tiffin (now ${qn})`,
          icon: Zap,
          onSelect: () => qtyMutation.mutate({ order, quantity: qn - 1 }),
        });
      }
    }
    // Delivered orders cannot be cancelled (the API rejects it) — don't offer it.
    if (live && order.status !== 'delivered' && can('orders.cancel')) {
      items.push({
        label: 'Cancel order…',
        icon: Ban,
        tone: 'danger',
        onSelect: () => void handleCancel(order),
      });
    }
    items.push({
      label: 'View profile',
      icon: User,
      onSelect: () => navigate(`/customers/${row.customer.id}`),
    });
    return items;
  };

  /* ---------------- booking cell ---------------- */

  const canBook = can('orders.book');

  const BookingCell = ({ row }: { row: BookingSheetRowDTO }) => {
    const order = orderFor(row, meal);
    const pendingThis =
      bookMutation.isPending && bookMutation.variables?.row.customer.id === row.customer.id;

    if (!order || order.status === 'cancelled') {
      return (
        <div className="flex items-center gap-2">
          {order?.status === 'cancelled' && <StatusBadge status="cancelled" />}
          {canBook ? (
            <button
              type="button"
              className="btn btn-flame btn-sm min-w-[7.5rem] uppercase tracking-wide"
              disabled={pendingThis}
              onClick={() => bookMutation.mutate({ row })}
            >
              {pendingThis ? (
                <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />
              ) : order?.status === 'cancelled' ? (
                'Rebook'
              ) : (
                `Book ${meal}`
              )}
            </button>
          ) : (
            !order && <span className="text-sm text-charcoal/35">—</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex min-w-[7.5rem] items-center gap-2">
        <StatusBadge status={order.status} />
        {order.priceOverridden && (
          <span className="chip bg-flame-50 text-flame-700" title="Booked at a custom price">
            ₹ custom
          </span>
        )}
      </div>
    );
  };

  /* ---------------- render ---------------- */

  const allBookableSelected =
    bookableRows.length > 0 && bookableRows.every((r) => selected.has(r.customer.id));

  const toggleAll = () => {
    setSelected(
      allBookableSelected ? new Set() : new Set(bookableRows.map((r) => r.customer.id)),
    );
  };

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mealTabs: Array<{ key: MealType; icon: typeof Sun; count: number }> = [
    { key: 'breakfast', icon: Coffee, count: counts.breakfast },
    { key: 'lunch', icon: Sun, count: counts.lunch },
    { key: 'dinner', icon: Moon, count: counts.dinner },
  ];

  return (
    <div>
      <PageHeader
        title="Daily Orders"
        actions={<DateStrip date={date} onChange={(d) => setParam('date', d === today ? null : d)} />}
      />

      {/* Meal tabs · search · bulk CTA */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-[#e7decf] bg-white p-1 shadow-sm">
          {mealTabs.map((tab) => {
            const Icon = tab.icon;
            const active = meal === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={cls(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-500',
                  active
                    ? 'bg-flame-500 text-white shadow-sm'
                    : 'text-charcoal/55 hover:bg-flame-50 hover:text-flame-700',
                )}
                onClick={() => setParam('meal', tab.key === 'lunch' ? null : tab.key)}
              >
                <Icon className="h-4 w-4" />
                {tab.key}
                <span
                  className={cls(
                    'tnum rounded-full px-2 py-0.5 text-[11px] font-bold',
                    active ? 'bg-white/20 text-white' : 'bg-forest-50 text-forest-700',
                  )}
                >
                  {sheetQuery.isPending ? '…' : tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/35" />
          <input
            className="input pl-9"
            placeholder="Search name / mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {canBook && (
          <button
            type="button"
            className="btn btn-flame ml-auto"
            onClick={() => void handleBookAllRegular()}
            disabled={bulkMutation.isPending}
          >
            {bulkMutation.isPending ? (
              <Spinner className="h-4 w-4 border-white/40 border-t-white" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Book all regular
          </button>
        )}
      </div>

      {/* Bulk selection bar */}
      {canBook && selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-flame-200 bg-flame-50 px-4 py-3 shadow-lift md:static md:shadow-card">
          <p className="text-sm font-semibold text-flame-800">
            {selectedIds.length} selected
          </p>
          <button
            type="button"
            className="btn btn-flame btn-sm"
            onClick={() => void handleBookSelected()}
            disabled={bulkMutation.isPending}
          >
            Book {selectedIds.length} selected for {meal}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Sheet */}
      {sheetQuery.isError ? (
        <div className="card">
          <ErrorState onRetry={() => sheetQuery.refetch()} />
        </div>
      ) : sheetQuery.isPending ? (
        <div className="card overflow-hidden">
          <ListSkeleton rows={8} />
        </div>
      ) : rows.length > 0 && visibleRows.length === 0 ? (
        <div className="card">
          <EmptyState
            variant="pot"
            title={`No one takes ${meal} yet`}
            message={`Set a ${meal} price on a customer (Customers → Edit → Update prices) and they will appear on this tab.`}
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate('/customers')}>
                Go to Customers
              </button>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            variant={q ? 'search' : 'pot'}
            title={q ? `No customers match “${q}”` : `No active customers yet`}
            message={
              q
                ? 'Try a different name or mobile number.'
                : 'Add customers first — then book their tiffins here each morning.'
            }
            action={
              !q && (
                <button type="button" className="btn btn-primary" onClick={() => navigate('/customers')}>
                  Go to Customers
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1e9dc] bg-cream/70">
                  {canBook && (
                    <th className="th w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all bookable"
                        className="h-4 w-4 accent-flame-500"
                        checked={allBookableSelected}
                        disabled={bookableRows.length === 0}
                        onChange={toggleAll}
                      />
                    </th>
                  )}
                  <th className="th">Customer</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Price</th>
                  <th className="th">
                    <span className="flex items-center gap-1.5 capitalize">
                      <MealChip meal={meal} /> {formatBusinessDate(date)}
                    </span>
                  </th>
                  <th className="th w-12 text-right" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const order = orderFor(row, meal);
                  const bookable = isBookable(row, meal);
                  return (
                    <tr
                      key={row.customer.id}
                      className={cls(
                        'border-b border-[#f6f0e6] transition-colors last:border-b-0 hover:bg-forest-50/50',
                        selected.has(row.customer.id) && 'bg-flame-50/50',
                      )}
                    >
                      {canBook && (
                        <td className="td">
                          {bookable ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.customer.fullName}`}
                              className="h-4 w-4 accent-flame-500"
                              checked={selected.has(row.customer.id)}
                              onChange={() => toggleOne(row.customer.id)}
                            />
                          ) : (
                            <span className="block h-4 w-4" />
                          )}
                        </td>
                      )}
                      <td className="td">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => navigate(`/customers/${row.customer.id}`)}
                        >
                          <span className="block text-sm font-semibold text-charcoal hover:text-forest-700">
                            {row.customer.fullName}
                          </span>
                          <span className="tnum block text-[11px] text-charcoal/45">
                            {row.customer.mobile}
                          </span>
                        </button>
                      </td>
                      <td className="td">
                        <TypeChip type={row.customer.type} />
                      </td>
                      <td className="td tnum text-right text-sm font-semibold">
                        {order && order.status !== 'cancelled' && (order.quantity ?? 1) > 1 && (
                          <span className="mr-1 text-xs font-bold text-flame-600">
                            ×{order.quantity}
                          </span>
                        )}
                        {formatINR(
                          order && order.status !== 'cancelled'
                            ? order.price
                            : unitPriceFor(row, meal),
                        )}
                      </td>
                      <td className="td">
                        <BookingCell row={row} />
                      </td>
                      <td className="td text-right">
                        <RowMenu items={menuItemsFor(row)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-[#f6f0e6] md:hidden">
            {visibleRows.map((row) => {
              const bookable = isBookable(row, meal);
              const order = orderFor(row, meal);
              return (
                <li key={row.customer.id} className="flex items-start gap-3 p-4">
                  {canBook && bookable && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.customer.fullName}`}
                      className="mt-1.5 h-4 w-4 accent-flame-500"
                      checked={selected.has(row.customer.id)}
                      onChange={() => toggleOne(row.customer.id)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-semibold text-charcoal"
                        onClick={() => navigate(`/customers/${row.customer.id}`)}
                      >
                        {row.customer.fullName}
                      </button>
                      <RowMenu items={menuItemsFor(row)} />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-charcoal/45">
                      <span className="tnum">{row.customer.mobile}</span>
                      <TypeChip type={row.customer.type} />
                      <span className="tnum font-semibold text-charcoal/70">
                        {order && order.status !== 'cancelled' && (order.quantity ?? 1) > 1
                          ? `×${order.quantity} · `
                          : ''}
                        {formatINR(
                          order && order.status !== 'cancelled'
                            ? order.price
                            : unitPriceFor(row, meal),
                        )}
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <BookingCell row={row} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {overrideTarget && (
        <OverridePriceModal
          row={overrideTarget}
          meal={meal}
          date={date}
          busy={bookMutation.isPending}
          onClose={() => setOverrideTarget(null)}
          onBook={(price) => {
            bookMutation.mutate({ row: overrideTarget, priceOverride: price });
            setOverrideTarget(null);
          }}
        />
      )}
    </div>
  );
}

function OverridePriceModal({
  row,
  meal,
  date,
  busy,
  onClose,
  onBook,
}: {
  row: BookingSheetRowDTO;
  meal: MealType;
  date: string;
  busy: boolean;
  onClose: () => void;
  onBook: (price: number) => void;
}) {
  const defaultPrice = unitPriceFor(row, meal);
  const [value, setValue] = useState(String(defaultPrice));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      setError('Enter a whole amount between 0 and 10,000');
      return;
    }
    onBook(n);
  };

  return (
    <Modal
      title="Book at custom price"
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="override-price-form" className="btn btn-flame" disabled={busy}>
            Book {meal} · {Number(value) >= 0 && value !== '' ? formatINR(Number(value)) : '—'}
          </button>
        </>
      }
    >
      <form id="override-price-form" onSubmit={submit}>
        <p className="mb-4 text-sm text-charcoal/60">
          <strong className="text-charcoal">{row.customer.fullName}</strong> ·{' '}
          <span className="capitalize">{meal}</span> on {formatBusinessDate(date)}. Usual price{' '}
          {formatINR(defaultPrice)} — this booking only.
        </p>
        <label className="label">Price (₹)</label>
        <input
          type="number"
          className="input tnum"
          min={0}
          max={10000}
          step={1}
          value={value}
          autoFocus
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
