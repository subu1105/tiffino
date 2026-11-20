import {
  addDays,
  formatBusinessDate,
  formatINR,
  MEAL_LABELS,
  MEAL_TYPES,
  todayBusinessDate,
  type BookingSheetRowDTO,
  type MealType,
  type OrderDTO,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { CalendarSheet } from '@/components/calendar-sheet';
import { TypeTag } from '@/components/chip';
import { useConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, errorMessage } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { PrimaryButton } from '@/components/primary-button';
import { PromptModal } from '@/components/prompt-modal';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { ApiError } from '@/lib/api';
import {
  bookOrder,
  bulkBook,
  cancelOrder,
  fetchBookingSheet,
  updateOrderQuantity,
  updateOrderStatus,
} from '@/lib/queries';
import { useAuth, useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type SheetRows = BookingSheetRowDTO[];

export default function OrdersScreen() {
  const can = useCan();
  const { user } = useAuth();
  const toast = useToast();
  const sheet = useConfirmSheet();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ meal?: string; date?: string; ts?: string }>();

  const today = todayBusinessDate();
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState<MealType>('lunch');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [cancelTarget, setCancelTarget] = useState<OrderDTO | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickingDate, setPickingDate] = useState(false);
  useRefreshOnFocus(['sheet']);

  // Selection is per date+meal — a flipped tab or date means a new context.
  useEffect(() => {
    setSelected(new Set());
  }, [date, meal]);

  const toggleSelect = (customerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  // Honor /orders?meal=&date= pushed from Home. `ts` is a per-tap nonce so a
  // re-tap with identical meal/date still re-applies them after local changes.
  useEffect(() => {
    if ((MEAL_TYPES as readonly string[]).includes(params.meal ?? '')) setMeal(params.meal as MealType);
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) setDate(params.date);
  }, [params.meal, params.date, params.ts]);

  // Debounced server search (300 ms).
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const sheetKey = ['sheet', date, q] as const;
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () => fetchBookingSheet(date, q || undefined),
    placeholderData: (prev) => prev,
  });

  const rows = sheetQuery.data ?? [];
  const mealCounts = useMemo(() => {
    const counts: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const r of rows) {
      for (const m of MEAL_TYPES) {
        const o = r[m];
        if (o) counts[m] += o.quantity ?? 1;
      }
    }
    return counts;
  }, [rows]);

  const unitPriceFor = (row: BookingSheetRowDTO, m: MealType): number =>
    m === 'breakfast'
      ? row.customer.breakfastPrice
      : m === 'lunch'
        ? row.customer.lunchPrice
        : row.customer.dinnerPrice;

  // A customer without a price for this meal doesn't take it — hide the row on
  // this tab. Existing bookings always stay visible, whatever the price now is.
  const visibleRows = useMemo(
    () => rows.filter((r) => r[meal] || unitPriceFor(r, meal) > 0),
    [rows, meal],
  );

  const invalidateAfterMutation = () => {
    queryClient.invalidateQueries({ queryKey: ['sheet', date] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  /* ---------------- book one (optimistic) ---------------- */

  const bookMutation = useMutation({
    mutationFn: (row: BookingSheetRowDTO) =>
      bookOrder({ customerId: row.customer.id, orderDate: date, mealType: meal }),
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: ['sheet', date] });
      const previous = queryClient.getQueryData<SheetRows>(sheetKey);
      const optimistic: OrderDTO = {
        id: `optimistic-${row.customer.id}`,
        customerId: row.customer.id,
        customerName: row.customer.fullName,
        orderDate: date,
        mealType: meal,
        customerTypeSnapshot: row.customer.type,
        price: unitPriceFor(row, meal),
        unitPrice: unitPriceFor(row, meal),
        quantity: 1,
        priceOverridden: false,
        status: 'booked',
        active: true,
        cancelledAt: null,
        cancellationReason: '',
        createdByName: user?.fullName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<SheetRows>(sheetKey, (old) =>
        (old ?? []).map((r) =>
          r.customer.id === row.customer.id ? { ...r, [meal]: optimistic } : r,
        ),
      );
      // Capture the key/date the optimistic write actually touched: if the user
      // flips date/meal before the request settles, rollback and invalidation
      // must target the ORIGINAL sheet, not the one currently on screen.
      return { previous, key: sheetKey, date };
    },
    onError: (err, row, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
      if (err instanceof ApiError && err.code === 'DUPLICATE_BOOKING') {
        toast.show(`${row.customer.fullName} is already booked for ${meal}.`, 'info');
      } else if (err instanceof ApiError && err.code === 'CUSTOMER_INACTIVE') {
        toast.show(`${row.customer.fullName} is inactive — reactivate them first.`, 'error');
      } else {
        toast.show(`Couldn't book ${row.customer.fullName} — ${errorMessage(err)}`, 'error');
      }
    },
    onSettled: (_data, _err, _row, context) => {
      queryClient.invalidateQueries({ queryKey: ['sheet', context?.date ?? date] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  /* ---------------- bulk book ---------------- */

  const bulkMutation = useMutation({
    mutationFn: (customerIds?: string[]) =>
      customerIds && customerIds.length > 0
        ? bulkBook({ orderDate: date, mealType: meal, mode: 'selected', customerIds })
        : bulkBook({ orderDate: date, mealType: meal, mode: 'all-regular' }),
    onSuccess: (result) => {
      setSelected(new Set());
      const skippedNames = result.skippedCustomers
        .slice(0, 8)
        .map((s) => `• ${s.fullName} (${s.reason === 'already-booked' ? 'already booked' : 'inactive'})`)
        .join('\n');
      const extra =
        result.skippedCustomers.length > 8
          ? `\n…and ${result.skippedCustomers.length - 8} more`
          : '';
      void sheet.notice(
        `Booked ${result.booked} · Skipped ${result.skipped}`,
        result.skipped > 0 ? `${skippedNames}${extra}` : 'Everyone selected is booked.',
      );
    },
    onError: (err) => toast.show(errorMessage(err), 'error'),
    onSettled: invalidateAfterMutation,
  });

  const confirmBulkBook = () => {
    void (async () => {
      const ok = await sheet.confirm({
        title: `Book all regular — ${meal}`,
        message: `Book ${meal} on ${formatBusinessDate(date)} for every active regular customer? Already-booked customers are skipped automatically.`,
        confirmLabel: 'Book all',
        tone: 'flame',
      });
      if (ok) bulkMutation.mutate(undefined);
    })();
  };

  const confirmBookSelected = () => {
    const ids = [...selected];
    void (async () => {
      const ok = await sheet.confirm({
        title: `Book ${ids.length} selected — ${meal}`,
        message: `Book ${meal} on ${formatBusinessDate(date)} for the ${ids.length} selected customer${ids.length > 1 ? 's' : ''}?`,
        confirmLabel: `Book ${ids.length}`,
        tone: 'flame',
      });
      if (ok) bulkMutation.mutate(ids);
    })();
  };

  /* ---------------- status / cancel ---------------- */

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: 'prepared' | 'delivered' }) =>
      updateOrderStatus(orderId, status),
    onSuccess: (order) => toast.show(`${order.customerName} marked ${order.status}.`, 'success'),
    onError: (err) => toast.show(errorMessage(err), 'error'),
    onSettled: invalidateAfterMutation,
  });

  const qtyMutation = useMutation({
    mutationFn: ({ orderId, quantity }: { orderId: string; quantity: number }) =>
      updateOrderQuantity(orderId, quantity),
    onSuccess: (order) =>
      toast.show(
        `${order.customerName}: ${order.quantity} tiffin${order.quantity > 1 ? 's' : ''} — ${formatINR(order.price)}.`,
        'success',
      ),
    onError: (err) => toast.show(errorMessage(err), 'error'),
    onSettled: invalidateAfterMutation,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      cancelOrder(orderId, reason),
    onSuccess: (order) => toast.show(`Cancelled ${order.customerName}'s ${order.mealType}.`, 'success'),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'ORDER_ALREADY_CANCELLED') {
        toast.show('That order was already cancelled.', 'info');
      } else {
        toast.show(errorMessage(err), 'error');
      }
    },
    onSettled: invalidateAfterMutation,
  });

  const openOrderActions = (row: BookingSheetRowDTO, order: OrderDTO) => {
    if (order.id.startsWith('optimistic-')) return; // still confirming with the server
    const items: { label: string; tone?: 'danger'; run: () => void }[] = [];
    if (can('orders.updateStatus') && order.status === 'booked') {
      items.push({
        label: 'Mark prepared',
        run: () => statusMutation.mutate({ orderId: order.id, status: 'prepared' }),
      });
    }
    if (can('orders.updateStatus') && (order.status === 'booked' || order.status === 'prepared')) {
      items.push({
        label: 'Mark delivered',
        run: () => statusMutation.mutate({ orderId: order.id, status: 'delivered' }),
      });
    }
    if (can('orders.book') && order.status !== 'delivered') {
      const q = order.quantity ?? 1;
      items.push({
        label: `+1 tiffin (now ${q})`,
        run: () => qtyMutation.mutate({ orderId: order.id, quantity: q + 1 }),
      });
      if (q > 1) {
        items.push({
          label: `−1 tiffin (now ${q})`,
          run: () => qtyMutation.mutate({ orderId: order.id, quantity: q - 1 }),
        });
      }
    }
    if (can('orders.cancel') && order.status !== 'delivered') {
      items.push({ label: 'Cancel order', tone: 'danger', run: () => setCancelTarget(order) });
    }
    if (items.length === 0) {
      toast.show(
        order.status === 'delivered'
          ? 'Delivered orders can no longer change.'
          : 'You lack permission to change this order.',
        'info',
      );
      return;
    }
    void (async () => {
      const idx = await sheet.actions(
        row.customer.fullName,
        `${MEAL_LABELS[meal]} · ${(order.quantity ?? 1) > 1 ? `${order.quantity} × ${formatINR(order.unitPrice)} = ` : ''}${formatINR(order.price)} · ${order.status}`,
        items.map(({ label, tone }) => ({ label, tone })),
      );
      if (idx !== null) items[idx]?.run();
    })();
  };

  /* ---------------- rendering ---------------- */

  const renderRow = ({ item }: { item: BookingSheetRowDTO }) => {
    const order = item[meal];
    const price = order ? order.price : unitPriceFor(item, meal);
    const selectable = !order && can('orders.book');
    const isSelected = selected.has(item.customer.id);
    return (
      <View
        className="mx-4 mb-3 rounded-2xl bg-white p-4"
        style={{
          shadowColor: '#1b4332',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}>
        <View className="flex-row items-center justify-between">
          <View className="mr-2 flex-1 flex-row items-center" style={{ gap: 8 }}>
            {selectable ? (
              <Pressable
                onPress={() => toggleSelect(item.customer.id)}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`Select ${item.customer.fullName}`}
                className={`h-6 w-6 items-center justify-center rounded-md border-2 ${isSelected ? 'border-flame-500 bg-flame-500' : 'border-charcoal/25 bg-white'}`}>
                {isSelected ? <Text className="text-xs font-black text-white">✓</Text> : null}
              </Pressable>
            ) : null}
            <Text className="shrink text-base font-bold text-charcoal" numberOfLines={1}>
              {item.customer.fullName}
            </Text>
            <TypeTag type={item.customer.type} />
          </View>
          <Text className="text-base font-extrabold text-forest-800">{formatINR(price)}</Text>
        </View>
        <View className="mt-3">
          {order ? (
            <Pressable
              onPress={() => openOrderActions(item, order)}
              onLongPress={() => openOrderActions(item, order)}
              accessibilityRole="button"
              accessibilityLabel={`${order.status} — open actions`}
              className="min-h-[48px] flex-row items-center justify-center rounded-2xl bg-cream active:bg-forest-50">
              <StatusBadge status={order.status} />
              {(order.quantity ?? 1) > 1 ? (
                <Text className="ml-2 text-sm font-extrabold text-flame-600">×{order.quantity}</Text>
              ) : null}
              <Text className="ml-2 text-xs text-charcoal/40">hold for actions</Text>
            </Pressable>
          ) : can('orders.book') ? (
            <PrimaryButton
              label="BOOK"
              variant="flame"
              compact
              onPress={() => bookMutation.mutate(item)}
            />
          ) : (
            <View className="min-h-[44px] items-center justify-center rounded-2xl bg-cream">
              <Text className="text-xs font-semibold text-charcoal/40">Not booked</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen>
      {/* Date strip */}
      <View className="flex-row items-center justify-between px-4 pt-2">
        <Text className="text-xs font-extrabold tracking-[4px] text-forest-800">DAILY ORDERS</Text>
      </View>
      <View className="mt-2 flex-row items-center px-4" style={{ gap: 8 }}>
        <Pressable
          onPress={() => setDate((d) => addDays(d, -1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          className="h-11 w-11 items-center justify-center rounded-2xl bg-white">
          <Text className="text-xl font-bold text-forest-800">‹</Text>
        </Pressable>
        <Pressable
          onPress={() => setPickingDate(true)}
          accessibilityRole="button"
          accessibilityLabel="Pick a date"
          className="h-11 flex-1 flex-row items-center justify-center rounded-2xl bg-white active:bg-forest-50"
          style={{ gap: 6 }}>
          <Text className="text-sm font-bold text-charcoal">{formatBusinessDate(date)}</Text>
          <Text className="text-xs text-charcoal/40">▾</Text>
        </Pressable>
        <Pressable
          onPress={() => setDate((d) => addDays(d, 1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          className="h-11 w-11 items-center justify-center rounded-2xl bg-white">
          <Text className="text-xl font-bold text-forest-800">›</Text>
        </Pressable>
        <Pressable
          onPress={() => setDate(today)}
          hitSlop={8}
          accessibilityRole="button"
          className={`h-11 items-center justify-center rounded-2xl px-3.5 ${date === today ? 'bg-flame-500' : 'bg-white'}`}>
          <Text className={`text-sm font-bold ${date === today ? 'text-white' : 'text-flame-600'}`}>
            Today
          </Text>
        </Pressable>
      </View>

      {/* Meal segmented control */}
      <View className="mx-4 mt-3 flex-row rounded-2xl bg-white p-1">
        {MEAL_TYPES.map((m) => {
          const selected = meal === m;
          const count = mealCounts[m];
          return (
            <Pressable
              key={m}
              onPress={() => setMeal(m)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`min-h-[44px] flex-1 flex-row items-center justify-center rounded-xl ${selected ? 'bg-forest-800' : ''}`}>
              <Text className={`text-xs font-bold ${selected ? 'text-cream' : 'text-charcoal/60'}`}>
                {MEAL_LABELS[m]} · {count}
              </Text>
              {selected ? (
                <View className="absolute bottom-1 h-0.5 w-8 rounded-full bg-flame-500" />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Search */}
      <View className="mx-4 mt-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or mobile…"
          placeholderTextColor="#2B2D2F55"
          autoCapitalize="none"
          className="min-h-[48px] rounded-2xl bg-white px-4 py-2.5 text-base text-charcoal"
        />
      </View>

      {/* Bulk book */}
      {can('orders.book') ? (
        <View className="mx-4 mt-3">
          <PrimaryButton
            label={`+ BOOK ALL REGULAR — ${meal.toUpperCase()}`}
            variant="flame"
            compact
            loading={bulkMutation.isPending}
            onPress={confirmBulkBook}
          />
        </View>
      ) : null}

      {/* Sheet */}
      {sheetQuery.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={5} rowHeight={104} />
        </View>
      ) : sheetQuery.isError ? (
        <ErrorState error={sheetQuery.error} onRetry={() => sheetQuery.refetch()} />
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={(row) => row.customer.id}
          renderItem={renderRow}
          extraData={selected}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: selected.size > 0 ? 110 : 24 }}
          refreshControl={
            <RefreshControl
              refreshing={sheetQuery.isRefetching}
              onRefresh={() => {
                sheetQuery.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListEmptyComponent={
            rows.length > 0 ? (
              <EmptyState
                title={`No one takes ${meal} yet`}
                message={`Set a ${meal} price on a customer (Customers → Edit) and they will appear here.`}
              />
            ) : (
              <EmptyState
                title={q ? 'No customers match' : 'No active customers'}
                message={q ? 'Try a different name or mobile.' : 'Add customers to start booking tiffins.'}
              />
            )
          }
        />
      )}

      {/* Sticky bulk bar: appears when customers are ticked */}
      {selected.size > 0 ? (
        <View
          className="absolute bottom-5 left-4 right-4 flex-row items-center rounded-2xl bg-forest-800 p-3"
          style={{
            gap: 10,
            shadowColor: '#0b2118',
            shadowOpacity: 0.3,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}>
          <Text className="ml-1 flex-1 text-sm font-bold text-cream">
            {selected.size} selected
          </Text>
          <Pressable
            onPress={() => setSelected(new Set())}
            hitSlop={8}
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center px-2">
            <Text className="text-xs font-bold text-forest-200">CLEAR</Text>
          </Pressable>
          <Pressable
            onPress={confirmBookSelected}
            disabled={bulkMutation.isPending}
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center rounded-xl bg-flame-500 px-4 active:bg-flame-600">
            <Text className="text-sm font-extrabold text-white">
              {bulkMutation.isPending ? 'BOOKING…' : `BOOK ${selected.size} — ${meal.toUpperCase()}`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Tap-the-date → jump straight to any date's booking sheet */}
      <CalendarSheet
              visible={pickingDate}
              value={date}
              title="Go to date"
              onClose={() => setPickingDate(false)}
              onPick={(d) => {
                setPickingDate(false);
                setDate(d);
              }}
            />

      <PromptModal
        visible={cancelTarget !== null}
        title={`Cancel ${cancelTarget?.customerName ?? ''}'s ${cancelTarget?.mealType ?? ''}?`}
        message="This frees the slot for the day. Add an optional reason."
        placeholder="Reason (optional)"
        confirmLabel="Cancel order"
        destructive
        onConfirm={(reason) => {
          if (cancelTarget) cancelMutation.mutate({ orderId: cancelTarget.id, reason });
          setCancelTarget(null);
        }}
        onDismiss={() => setCancelTarget(null)}
      />
    </Screen>
  );
}
