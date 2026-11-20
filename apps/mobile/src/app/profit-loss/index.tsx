import {
  formatBusinessDate,
  formatINR,
  type DateRange,
  type DashboardFilter,
} from '@tiffino/shared';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { PeriodSheet } from '@/components/period-sheet';
import { Screen } from '@/components/screen';
import { fetchProfitLoss } from '@/lib/queries';
import { useCan } from '@/providers/auth';

type RangeKey = DashboardFilter | 'custom';

/** Revenue vs kharcha — the daily/weekly/monthly profit picture. */
export default function ProfitLossScreen() {
  const can = useCan();
  const [rangeKey, setRangeKey] = useState<RangeKey>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const query = useQuery({
    queryKey: ['profit-loss', rangeKey, customRange?.from, customRange?.to],
    queryFn: () =>
      rangeKey === 'custom' && customRange
        ? fetchProfitLoss({ from: customRange.from, to: customRange.to })
        : fetchProfitLoss({ filter: rangeKey as DashboardFilter }),
    enabled: can('expenses.view') && (rangeKey !== 'custom' || customRange !== null),
  });

  if (!can('expenses.view')) {
    return (
      <Screen title="Profit & Loss">
        <EmptyState title="No expense access" message="Ask the owner for expense permission." />
      </Screen>
    );
  }

  const data = query.data;
  const profit = data?.profit ?? 0;
  const inProfit = profit >= 0;
  // Only days where something happened keep the list scannable.
  const activeDays = (data?.byDate ?? []).filter((p) => p.revenue > 0 || p.expense > 0);

  return (
    <Screen
      title="Profit & Loss"
      subtitle={data ? `${formatBusinessDate(data.from)} – ${formatBusinessDate(data.to)}` : undefined}>
      <View className="mt-2 flex-row flex-wrap px-4" style={{ gap: 8 }}>
        <Chip label="Today" selected={rangeKey === 'today'} onPress={() => setRangeKey('today')} />
        <Chip label="Yesterday" selected={rangeKey === 'yesterday'} onPress={() => setRangeKey('yesterday')} />
        <Chip label="Week" selected={rangeKey === 'this-week'} onPress={() => setRangeKey('this-week')} />
        <Chip label="Month" selected={rangeKey === 'this-month'} onPress={() => setRangeKey('this-month')} />
        <Chip label="Custom" selected={rangeKey === 'custom'} onPress={() => setCustomOpen(true)} />
      </View>

      {query.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={4} rowHeight={72} />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : data ? (
        <FlatList
          data={activeDays}
          keyExtractor={(p) => p.date}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                query.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListHeaderComponent={
            <>
              {/* The verdict card */}
              <View
                className={`mx-4 mt-3 rounded-2xl p-5 ${inProfit ? 'bg-forest-800' : 'bg-danger'}`}>
                <Text className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                  {inProfit ? 'Profit' : 'Loss'}
                </Text>
                <Text className="mt-1 text-3xl font-extrabold text-white">
                  {inProfit ? '+' : '−'}
                  {formatINR(Math.abs(profit))}
                </Text>
                <View className="mt-4 flex-row" style={{ gap: 12 }}>
                  <View className="flex-1 rounded-xl bg-white/10 p-3">
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                      Tiffin revenue
                    </Text>
                    <Text className="mt-0.5 text-base font-extrabold text-white">
                      {formatINR(data.revenue)}
                    </Text>
                  </View>
                  <View className="flex-1 rounded-xl bg-white/10 p-3">
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                      Expenses
                    </Text>
                    <Text className="mt-0.5 text-base font-extrabold text-white">
                      {formatINR(data.expense)}
                    </Text>
                    {data.cookWage > 0 ? (
                      <Text className="mt-0.5 text-[10px] text-white/60">
                        incl. cook {formatINR(data.cookWage)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {activeDays.length > 1 ? (
                <Text className="mt-5 px-4 text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
                  Day by day
                </Text>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <EmptyState
              title="Nothing in this range"
              message="No bookings or expenses on these dates."
            />
          }
          renderItem={({ item: p }) => {
            const dayProfit = p.profit;
            const dayInProfit = dayProfit >= 0;
            return (
              <View className="mx-4 mt-2 flex-row items-center rounded-2xl bg-white px-4 py-3">
                <View className="mr-2 flex-1">
                  <Text className="text-sm font-bold text-charcoal">
                    {formatBusinessDate(p.date)}
                  </Text>
                  <Text className="mt-0.5 text-xs text-charcoal/55">
                    Revenue {formatINR(p.revenue)} · Expenses {formatINR(p.expense)}
                    {p.cookWage > 0 ? ` (cook ${formatINR(p.cookWage)})` : ''}
                  </Text>
                </View>
                <Text
                  className={`overflow-hidden rounded-lg px-2.5 py-1 text-sm font-extrabold ${
                    dayInProfit ? 'bg-forest-100 text-forest-800' : 'bg-danger/10 text-danger'
                  }`}>
                  {dayInProfit ? '+' : '−'}
                  {formatINR(Math.abs(dayProfit))}
                </Text>
              </View>
            );
          }}
        />
      ) : null}

      <PeriodSheet
        visible={customOpen}
        title="Profit & Loss range"
        confirmLabel="Calculate"
        onPick={(_label, f, t) => {
          if (f && t) {
            setCustomRange({ from: f, to: t });
            setRangeKey('custom');
          }
        }}
        onClose={() => setCustomOpen(false)}
      />
    </Screen>
  );
}
