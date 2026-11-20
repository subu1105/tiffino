import {
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  toBusinessDate,
  type OrderDTO,
  type StatementDTO,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Chip, SettlementTag, TypeTag } from '@/components/chip';
import { useConfirmSheet } from '@/components/confirm-sheet';
import { PeriodSheet } from '@/components/period-sheet';
import { StatementReadySheet } from '@/components/statement-ready-sheet';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, errorMessage } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import {
  createStatement,
  deleteStatement,
  fetchCustomer,
  fetchCustomerOrdersReport,
  fetchCustomerPayments,
  fetchOrders,
  fetchStatements,
  setCustomerStatus,
} from '@/lib/queries';
import { prepareStatementFile, type ReadyStatement } from '@/lib/statement-pdf';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type RangeFilter = 'this-month' | 'last-month' | 'all';

function rangeFor(filter: RangeFilter): { from?: string; to?: string } {
  if (filter === 'all') return {};
  if (filter === 'this-month') return rangeForFilter('this-month');
  const { from } = rangeForFilter('this-month');
  const lastMonthEndDate = new Date(`${from}T12:00:00Z`);
  lastMonthEndDate.setUTCDate(0); // last day of previous month
  const to = lastMonthEndDate.toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export default function CustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const sheet = useConfirmSheet();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'bookings' | 'payments'>('bookings');
  const [range, setRange] = useState<RangeFilter>('this-month');

  const detailQuery = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => fetchCustomer(id),
    enabled: Boolean(id),
  });

  const { from, to } = useMemo(() => rangeFor(range), [range]);

  const canReports = can('reports.view');
  const bookingsQuery = useQuery({
    queryKey: ['reports', 'customer-orders', id, range, canReports],
    queryFn: async (): Promise<{ orders: OrderDTO[]; totalAmount: number | null }> => {
      if (canReports) {
        const report = await fetchCustomerOrdersReport({ customerId: id, from, to });
        return { orders: report.orders, totalAmount: report.totalAmount };
      }
      // Staff without reports.view still see bookings via the orders list.
      const res = await fetchOrders({ customerId: id, from, to, limit: 100 });
      return { orders: res.data, totalAmount: null };
    },
    enabled: Boolean(id) && tab === 'bookings' && (canReports || can('orders.view')),
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments', 'customer', id],
    queryFn: () => fetchCustomerPayments(id),
    enabled: Boolean(id) && tab === 'payments' && can('payments.view'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'inactive') => setCustomerStatus(id, status),
    onSuccess: (customer) => {
      toast.show(
        customer.status === 'active'
          ? `${customer.fullName} is active again.`
          : `${customer.fullName} deactivated.`,
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.show(errorMessage(err), 'error'),
  });

  const customer = detailQuery.data?.customer;
  const stats = detailQuery.data?.stats;

  /* ---- PDF statement: generate → record saved → preview → then send ---- */

  const [sharingStatement, setSharingStatement] = useState(false);
  const [readyStatement, setReadyStatement] = useState<ReadyStatement | null>(null);

  /** Build the PDF for a record and open the review sheet. */
  const openStatement = async (record: StatementDTO) => {
    if (!customer) return;
    const [orders, pays] = await Promise.all([
      canReports
        ? fetchCustomerOrdersReport({
            customerId: id,
            from: record.from ?? undefined,
            to: record.to ?? undefined,
          }).then((r) => r.orders)
        : fetchOrders({
            customerId: id,
            from: record.from ?? undefined,
            to: record.to ?? undefined,
            limit: 100,
          }).then((r) => r.data),
      paymentsQuery.data ? Promise.resolve(paymentsQuery.data) : fetchCustomerPayments(id),
    ]);
    const ready = await prepareStatementFile({
      record,
      customer: { fullName: customer.fullName, mobile: customer.mobile, type: customer.type },
      orders,
      payments: pays.payments,
    });
    setReadyStatement(ready);
  };

  const generateStatement = (periodLabel: string, sFrom?: string, sTo?: string) => {
    void (async () => {
      setSharingStatement(true);
      try {
        // The authoritative record saves first — it shows in the payments
        // section immediately, whether or not the PDF gets sent afterwards.
        const record = await createStatement({ customerId: id, periodLabel, from: sFrom, to: sTo });
        queryClient.invalidateQueries({ queryKey: ['statements'] });
        await openStatement(record);
      } catch (err) {
        toast.show(`Statement failed — ${errorMessage(err)}`, 'error');
      } finally {
        setSharingStatement(false);
      }
    })();
  };

  /** Re-view an already-sent statement from the list. */
  const viewStatement = (record: StatementDTO) => {
    void (async () => {
      setSharingStatement(true);
      try {
        await openStatement(record);
      } catch (err) {
        toast.show(`Could not open statement — ${errorMessage(err)}`, 'error');
      } finally {
        setSharingStatement(false);
      }
    })();
  };

  const confirmDeleteStatement = (record: StatementDTO) => {
    void (async () => {
      const ok = await sheet.confirm({
        title: 'Delete this statement record?',
        message: `${record.periodLabel} · ${formatINR(record.periodAmount)} — this only removes the record, not any orders or payments.`,
        cancelLabel: 'Keep it',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await deleteStatement(record.id);
        queryClient.invalidateQueries({ queryKey: ['statements'] });
        toast.show('Statement record deleted.', 'success');
      } catch (err) {
        toast.show(errorMessage(err), 'error');
      }
    })();
  };

  const [statementSheetOpen, setStatementSheetOpen] = useState(false);
  const thisMonth = rangeForFilter('this-month');

  const statementsQuery = useQuery({
    queryKey: ['statements', id],
    queryFn: () => fetchStatements(id),
    enabled: Boolean(id) && tab === 'payments' && can('payments.view'),
  });

  const confirmStatusFlip = () => {
    if (!customer) return;
    const deactivating = customer.status === 'active';
    void (async () => {
      const ok = await sheet.confirm({
        title: deactivating
          ? `Deactivate ${customer.fullName}?`
          : `Reactivate ${customer.fullName}?`,
        message: deactivating
          ? 'They disappear from the booking sheet. Existing orders and dues stay on record.'
          : 'They return to the booking sheet immediately.',
        cancelLabel: 'Back',
        confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
        tone: deactivating ? 'danger' : 'forest',
      });
      if (ok) statusMutation.mutate(deactivating ? 'inactive' : 'active');
    })();
  };

  if (detailQuery.isLoading) {
    return (
      <Screen title="Customer">
        <LoadingList rows={4} rowHeight={92} />
      </Screen>
    );
  }

  if (detailQuery.isError || !customer) {
    return (
      <Screen title="Customer">
        <ErrorState error={detailQuery.error ?? new Error('Not found')} onRetry={() => detailQuery.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      title={customer.fullName}
      subtitle={`${customer.type === 'regular' ? 'Regular' : 'Occasional'} · ${customer.status}`}
      headerRight={
        can('customers.manage') ? (
          <Pressable
            onPress={() => router.push({ pathname: '/customer/new', params: { id: customer.id } })}
            hitSlop={8}
            accessibilityRole="button"
            className="min-h-[40px] items-center justify-center rounded-full bg-white px-4">
            <Text className="text-sm font-bold text-forest-800">Edit</Text>
          </Pressable>
        ) : undefined
      }>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={detailQuery.isRefetching}
            onRefresh={() => {
              detailQuery.refetch();
              if (tab === 'bookings') bookingsQuery.refetch();
              else paymentsQuery.refetch();
            }}
            tintColor="#1b4332"
          />
        }>
        {/* Header card */}
        <View className="mx-4 rounded-2xl bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Pressable
              hitSlop={10}
              onPress={() => {
                Linking.openURL(`tel:${customer.mobile}`).catch(() =>
                  toast.show('Could not open the dialer on this device.', 'error'),
                );
              }}
              accessibilityRole="button"
              accessibilityLabel={`Call ${customer.mobile}`}
              className="min-h-[36px] flex-row items-center active:opacity-60">
              <Text className="text-base font-bold text-forest-600">📞 {customer.mobile}</Text>
            </Pressable>
            <TypeTag type={customer.type} />
          </View>
          {customer.address ? (
            <Text className="mt-2 text-sm text-charcoal/60">{customer.address}</Text>
          ) : null}
          <View className="mt-3 flex-row" style={{ gap: 10 }}>
            {customer.breakfastPrice > 0 ? (
              <View className="flex-1 rounded-xl bg-cream p-3">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50">
                  Breakfast
                </Text>
                <Text className="mt-1 text-lg font-extrabold text-forest-800">
                  {formatINR(customer.breakfastPrice)}
                </Text>
              </View>
            ) : null}
            <View className="flex-1 rounded-xl bg-cream p-3">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50">
                Lunch price
              </Text>
              <Text className="mt-1 text-lg font-extrabold text-forest-800">
                {formatINR(customer.lunchPrice)}
              </Text>
            </View>
            <View className="flex-1 rounded-xl bg-cream p-3">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50">
                Dinner price
              </Text>
              <Text className="mt-1 text-lg font-extrabold text-forest-800">
                {formatINR(customer.dinnerPrice)}
              </Text>
            </View>
            <View className="flex-1 rounded-xl bg-cream p-3">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50">
                Pending
              </Text>
              <Text
                className={`mt-1 text-lg font-extrabold ${stats && stats.pending > 0 ? 'text-flame-600' : 'text-success'}`}>
                {stats ? formatINR(stats.pending) : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Stat chips */}
        {stats ? (
          <View className="mx-4 mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
            <Text className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-charcoal/70">
              {stats.totalLunchOrders} lunches
            </Text>
            <Text className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-charcoal/70">
              {stats.totalDinnerOrders} dinners
            </Text>
            <Text className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-charcoal/70">
              {stats.cancelledOrders} cancelled
            </Text>
            <Text className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-charcoal/70">
              {formatINR(stats.totalBilled)} billed
            </Text>
            <Text className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-charcoal/70">
              {formatINR(stats.totalPaid)} paid
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        <View className="mx-4 mt-4 flex-row" style={{ gap: 10 }}>
          {can('payments.record') ? (
            <View className="flex-1">
              <PrimaryButton
                label="Record payment"
                compact
                onPress={() =>
                  router.push({ pathname: '/payment/new', params: { customerId: customer.id } })
                }
              />
            </View>
          ) : null}
          {can('customers.manage') ? (
            <View className="flex-1">
              <PrimaryButton
                label={customer.status === 'active' ? 'Deactivate' : 'Reactivate'}
                variant={customer.status === 'active' ? 'outline' : 'forest'}
                compact
                loading={statusMutation.isPending}
                onPress={confirmStatusFlip}
              />
            </View>
          ) : null}
        </View>

        {/* Segmented Bookings | Payments */}
        <View className="mx-4 mt-5 flex-row rounded-2xl bg-white p-1">
          {(['bookings', 'payments'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === t }}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-xl ${tab === t ? 'bg-forest-800' : ''}`}>
              <Text className={`text-sm font-bold ${tab === t ? 'text-cream' : 'text-charcoal/60'}`}>
                {t === 'bookings' ? 'Bookings' : 'Payments'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'bookings' ? (
          <>
            <View className="mx-4 mt-3 flex-row" style={{ gap: 8 }}>
              <Chip label="Month" selected={range === 'this-month'} onPress={() => setRange('this-month')} />
              <Chip label="Last month" selected={range === 'last-month'} onPress={() => setRange('last-month')} />
              <Chip label="All time" selected={range === 'all'} onPress={() => setRange('all')} />
            </View>
            {!canReports && !can('orders.view') ? (
              <EmptyState
                title="No bookings access"
                message="Ask the owner for order viewing permission."
              />
            ) : bookingsQuery.isLoading ? (
              <View className="mt-4">
                <LoadingList rows={4} rowHeight={56} />
              </View>
            ) : bookingsQuery.isError ? (
              <ErrorState error={bookingsQuery.error} onRetry={() => bookingsQuery.refetch()} />
            ) : (
              <View className="mx-4 mt-3 rounded-2xl bg-white">
                {bookingsQuery.data && bookingsQuery.data.orders.length > 0 ? (
                  <>
                    {bookingsQuery.data.orders.map((order, idx) => (
                      <View
                        key={order.id}
                        className={`min-h-[52px] flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-cream' : ''}`}>
                        <Text
                          className={`mr-2 flex-1 text-sm ${order.status === 'cancelled' ? 'text-charcoal/40 line-through' : 'text-charcoal'}`}
                          numberOfLines={1}>
                          {formatBusinessDate(order.orderDate)} ·{' '}
                          {order.mealType === 'lunch' ? 'Lunch' : 'Dinner'} · {formatINR(order.price)}
                        </Text>
                        <StatusBadge status={order.status} />
                      </View>
                    ))}
                    {bookingsQuery.data.totalAmount != null ? (
                      <Text className="border-t border-cream px-4 py-3 text-right text-xs font-bold text-charcoal/60">
                        Total (active): {formatINR(bookingsQuery.data.totalAmount)} — cancelled rows
                        excluded
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <EmptyState title="No bookings in this range" />
                )}
              </View>
            )}
          </>
        ) : (
          <>
            {!can('payments.view') ? (
              <EmptyState
                title="No payments access"
                message="Ask the owner for payment viewing permission."
              />
            ) : paymentsQuery.isLoading ? (
              <View className="mt-4">
                <LoadingList rows={4} rowHeight={56} />
              </View>
            ) : paymentsQuery.isError ? (
              <ErrorState error={paymentsQuery.error} onRetry={() => paymentsQuery.refetch()} />
            ) : paymentsQuery.data ? (
              <>
                <View className="mx-4 mt-3 flex-row rounded-2xl bg-forest-800 p-4" style={{ gap: 12 }}>
                  {(
                    [
                      ['Billed', paymentsQuery.data.balance.totalBilled],
                      ['Paid', paymentsQuery.data.balance.totalPaid],
                      ['Pending', paymentsQuery.data.balance.pending],
                    ] as const
                  ).map(([label, amount]) => (
                    <View key={label} className="flex-1">
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-forest-200">
                        {label}
                      </Text>
                      <Text className="mt-1 text-base font-extrabold text-cream">
                        {formatINR(amount)}
                      </Text>
                    </View>
                  ))}
                </View>
                {canReports || can('orders.view') ? (
                  <View className="mx-4 mt-3">
                    <PrimaryButton
                      label="📄 GENERATE PDF STATEMENT"
                      compact
                      loading={sharingStatement}
                      onPress={() => setStatementSheetOpen(true)}
                    />
                  </View>
                ) : null}

                {statementsQuery.data && statementsQuery.data.length > 0 ? (
                  <>
                    <Text className="mx-4 mt-5 text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
                      Statements sent
                    </Text>
                    <View className="mx-4 mt-2 rounded-2xl bg-white">
                      {statementsQuery.data.map((s, idx) => (
                        <View
                          key={s.id}
                          className={`flex-row items-center ${idx > 0 ? 'border-t border-cream' : ''}`}>
                          <Pressable
                            onPress={() => viewStatement(s)}
                            accessibilityRole="button"
                            accessibilityLabel={`View statement ${s.periodLabel}`}
                            className="min-h-[56px] flex-1 justify-center px-4 py-3 active:bg-forest-50">
                            <View className="flex-row items-center justify-between">
                              <Text
                                className="mr-2 flex-1 text-sm font-bold text-charcoal"
                                numberOfLines={1}>
                                {s.periodLabel}
                              </Text>
                              <SettlementTag status={s.settlementStatus} />
                            </View>
                            <Text className="mt-0.5 text-xs text-charcoal/55">
                              {s.totalTiffins} tiffins · {formatINR(s.periodAmount)} · pending then:{' '}
                              {formatINR(s.pending)}
                            </Text>
                            <Text className="mt-0.5 text-xs text-charcoal/55">
                              Received after sending: {formatINR(s.receivedSince)} ·{' '}
                              {formatBusinessDate(toBusinessDate(new Date(s.createdAt)))}
                            </Text>
                            <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-forest-600">
                              Tap to view / resend
                            </Text>
                          </Pressable>
                          {can('payments.record') ? (
                            <Pressable
                              onPress={() => confirmDeleteStatement(s)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Delete statement ${s.periodLabel}`}
                              className="h-11 w-11 items-center justify-center rounded-xl active:bg-danger/10">
                              <Text className="text-base font-bold text-danger">🗑</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
                <View className="mx-4 mt-3 rounded-2xl bg-white">
                  {paymentsQuery.data.payments.length > 0 ? (
                    paymentsQuery.data.payments.map((p, idx) => (
                      <View
                        key={p.id}
                        className={`min-h-[52px] flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-cream' : ''}`}>
                        <View className="mr-2 flex-1">
                          <Text className="text-sm font-semibold text-charcoal">
                            {formatBusinessDate(p.paymentDate)}
                          </Text>
                          <Text className="mt-0.5 text-xs uppercase text-charcoal/50">
                            {p.method.replace('_', ' ')}
                            {p.notes ? ` · ${p.notes}` : ''}
                          </Text>
                          {p.statementPeriodLabel ? (
                            <Text className="mt-0.5 text-[11px] font-bold text-forest-600" numberOfLines={1}>
                              ⇢ settles: {p.statementPeriodLabel}
                            </Text>
                          ) : null}
                        </View>
                        <Text className="text-sm font-extrabold text-success">{formatINR(p.amount)}</Text>
                      </View>
                    ))
                  ) : (
                    <EmptyState title="No payments recorded yet" />
                  )}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <PeriodSheet
        visible={statementSheetOpen}
        title="PDF statement"
        subtitle="Pick the dates — you'll preview the statement first and send it only if it looks right."
        initialFrom={thisMonth.from}
        confirmLabel="Generate statement"
        onPick={(label, f, t) => generateStatement(label, f, t)}
        onClose={() => setStatementSheetOpen(false)}
      />

      <StatementReadySheet ready={readyStatement} onClose={() => setReadyStatement(null)} />
    </Screen>
  );
}
