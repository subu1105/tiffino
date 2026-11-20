import {
  addDays,
  formatBusinessDate,
  formatINR,
  todayBusinessDate,
  type OrderStatisticsPointDTO,
} from '@tiffino/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ErrorState } from '@/components/error-state';
import { Screen } from '@/components/screen';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { fetchDashboardSummary, fetchOrderStatistics, fetchProfitLoss } from '@/lib/queries';
import { useAuth, useCan } from '@/providers/auth';

const LUNCH_BAR = '#27654e'; // forest-600 — validated pair on cream
const DINNER_BAR = '#d96b00'; // flame-600

function istGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function WeekBars({ points }: { points: OrderStatisticsPointDTO[] }) {
  const today = todayBusinessDate();
  const [selected, setSelected] = useState<string>(today);
  const max = Math.max(1, ...points.flatMap((p) => [p.lunch, p.dinner]));
  const selectedPoint = points.find((p) => p.date === selected) ?? points[points.length - 1];

  return (
    <View className="rounded-2xl bg-white p-4">
      <View className="flex-row items-end justify-between" style={{ height: 120 }}>
        {points.map((p) => {
          const lunchH = Math.max(p.lunch > 0 ? 6 : 2, Math.round((p.lunch / max) * 96));
          const dinnerH = Math.max(p.dinner > 0 ? 6 : 2, Math.round((p.dinner / max) * 96));
          const isSelected = selectedPoint?.date === p.date;
          return (
            <Pressable
              key={p.date}
              onPress={() => setSelected(p.date)}
              accessibilityRole="button"
              accessibilityLabel={`${formatBusinessDate(p.date)}: ${p.lunch} lunch, ${p.dinner} dinner`}
              className={`items-center rounded-xl px-1.5 pb-1 pt-2 ${isSelected ? 'bg-cream' : ''}`}>
              <View className="flex-row items-end" style={{ gap: 2, height: 96 }}>
                <View
                  style={{
                    width: 12,
                    height: lunchH,
                    backgroundColor: p.lunch > 0 ? LUNCH_BAR : '#d5e8dd',
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                />
                <View
                  style={{
                    width: 12,
                    height: dinnerH,
                    backgroundColor: p.dinner > 0 ? DINNER_BAR : '#ffe3bf',
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                />
              </View>
              <Text
                className={`mt-1.5 text-[10px] font-bold ${p.date === today ? 'text-flame-600' : 'text-charcoal/50'}`}>
                {formatBusinessDate(p.date).slice(0, 3)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedPoint ? (
        <Text className="mt-3 text-center text-xs font-semibold text-charcoal/70">
          {formatBusinessDate(selectedPoint.date)} · Lunch {selectedPoint.lunch} · Dinner{' '}
          {selectedPoint.dinner}
        </Text>
      ) : null}

      <View className="mt-3 flex-row items-center justify-center" style={{ gap: 16 }}>
        <View className="flex-row items-center">
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: LUNCH_BAR }} />
          <Text className="ml-1.5 text-xs font-semibold text-charcoal/70">Lunch</Text>
        </View>
        <View className="flex-row items-center">
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: DINNER_BAR }} />
          <Text className="ml-1.5 text-xs font-semibold text-charcoal/70">Dinner</Text>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const can = useCan();
  const router = useRouter();
  const today = todayBusinessDate();
  const canDashboard = can('dashboard.view');
  const canExpenses = can('expenses.view');
  useRefreshOnFocus(['dashboard'], ['profit-loss']);

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary', today],
    queryFn: () => fetchDashboardSummary(today),
    enabled: canDashboard,
  });

  const pnlQuery = useQuery({
    queryKey: ['profit-loss', 'today'],
    queryFn: () => fetchProfitLoss({ filter: 'today' }),
    enabled: canExpenses,
  });

  const weekFrom = addDays(today, -6);
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', weekFrom, today],
    queryFn: () => fetchOrderStatistics(weekFrom, today),
    enabled: canDashboard,
  });

  const refreshing =
    (summaryQuery.isFetching || statsQuery.isFetching) && !summaryQuery.isLoading && !statsQuery.isLoading;

  const firstName = useMemo(() => (user?.fullName ?? '').split(' ')[0] || 'there', [user]);
  const summary = summaryQuery.data;

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              summaryQuery.refetch();
              statsQuery.refetch();
              if (canExpenses) pnlQuery.refetch();
            }}
            tintColor="#1b4332"
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 pt-3">
          <Text className="text-xs font-extrabold tracking-[4px] text-forest-800">TIFFINO</Text>
          <Text className="mt-3 text-2xl font-extrabold text-charcoal">
            {istGreeting()}, {firstName}
          </Text>
          <Text className="mt-0.5 text-sm text-charcoal/60">{formatBusinessDate(today)}</Text>
        </View>

        {!canDashboard ? (
          <View className="mx-4 mt-6 rounded-2xl bg-white p-5">
            <Text className="text-base font-bold text-charcoal">Dashboard is owner-gated</Text>
            <Text className="mt-1 text-sm text-charcoal/60">
              Ask the owner for dashboard access to see today's numbers here. Your Orders and
              Customers tabs work as usual.
            </Text>
          </View>
        ) : summaryQuery.isError ? (
          <ErrorState error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
        ) : (
          <>
            <Text className="mt-6 px-4 text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
              Today at a glance
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-2.5"
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}>
              <StatCard
                label="Today's Lunch"
                value={summary ? String(summary.lunchOrders) : '—'}
                caption="booked"
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/orders',
                    // ts = per-tap nonce so a re-tap re-applies meal/date even
                    // after the user changed them inside the Orders tab.
                    params: { meal: 'lunch', date: today, ts: String(Date.now()) },
                  })
                }
              />
              <StatCard
                label="Today's Dinner"
                value={summary ? String(summary.dinnerOrders) : '—'}
                caption="booked"
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/orders',
                    params: { meal: 'dinner', date: today, ts: String(Date.now()) },
                  })
                }
              />
              <StatCard
                label="Expected Revenue"
                value={summary ? formatINR(summary.expectedRevenue) : '—'}
                caption="today"
              />
              <StatCard
                label="Pending Payments"
                value={summary ? formatINR(summary.pendingPayments) : '—'}
                caption="all time"
                accent
              />
            </ScrollView>

            {/* Aaj ka hisaab: revenue vs kharcha at a glance */}
            {canExpenses && pnlQuery.data ? (
              <Pressable
                onPress={() => router.push('/profit-loss')}
                accessibilityRole="button"
                className={`mx-4 mt-5 flex-row items-center rounded-2xl p-4 active:opacity-90 ${
                  pnlQuery.data.profit >= 0 ? 'bg-forest-800' : 'bg-danger'
                }`}>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Today's {pnlQuery.data.profit >= 0 ? 'profit' : 'loss'}
                  </Text>
                  <Text className="mt-0.5 text-xl font-extrabold text-white">
                    {pnlQuery.data.profit >= 0 ? '+' : '−'}
                    {formatINR(Math.abs(pnlQuery.data.profit))}
                  </Text>
                  <Text className="mt-0.5 text-xs text-white/70">
                    Tiffin {formatINR(pnlQuery.data.revenue)} · Expenses{' '}
                    {formatINR(pnlQuery.data.expense)}
                  </Text>
                </View>
                <Text className="text-lg text-white/60">›</Text>
              </Pressable>
            ) : null}

            <Text className="mt-6 px-4 text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
              Lunch vs dinner — last 7 days
            </Text>
            <View className="mt-2.5 px-4">
              {statsQuery.isError ? (
                <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} />
              ) : statsQuery.data ? (
                <WeekBars points={statsQuery.data.points} />
              ) : (
                <View className="h-44 rounded-2xl bg-white" />
              )}
            </View>

            <View className="mt-6 flex-row items-center justify-between px-4">
              <Text className="text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
                Recent bookings
              </Text>
              <Pressable hitSlop={8} onPress={() => router.push('/(tabs)/orders')}>
                <Text className="text-xs font-bold text-forest-600">See all ›</Text>
              </Pressable>
            </View>
            <View className="mx-4 mt-2.5 rounded-2xl bg-white">
              {summary && summary.recentBookings.length === 0 ? (
                <Text className="p-5 text-sm text-charcoal/50">No bookings yet today.</Text>
              ) : (
                summary?.recentBookings.slice(0, 6).map((order, idx) => (
                  <Pressable
                    key={order.id}
                    onPress={() => router.push(`/customer/${order.customerId}`)}
                    className={`min-h-[56px] flex-row items-center justify-between px-4 py-3 active:bg-cream ${
                      idx > 0 ? 'border-t border-cream' : ''
                    }`}>
                    <View className="mr-3 flex-1">
                      <Text className="text-sm font-bold text-charcoal" numberOfLines={1}>
                        {order.customerName}
                      </Text>
                      <Text className="mt-0.5 text-xs text-charcoal/50">
                        {order.mealType === 'lunch' ? 'Lunch' : 'Dinner'} · {formatINR(order.price)}
                      </Text>
                    </View>
                    <StatusBadge status={order.status} />
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
