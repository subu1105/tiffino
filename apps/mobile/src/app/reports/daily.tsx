import { MEAL_LABELS, formatBusinessDate, formatINR, rangeForFilter, todayBusinessDate } from '@tiffino/shared';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ErrorState, errorMessage } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { PeriodSheet } from '@/components/period-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { fetchCustomerSummaryCsv, fetchDailyReport, fetchReportCsv } from '@/lib/queries';
import { shareFile } from '@/lib/share-file';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-[31%] rounded-xl bg-white p-3">
      <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50">{label}</Text>
      <Text className="mt-1 text-base font-extrabold text-forest-800">{value}</Text>
    </View>
  );
}

export default function DailyReportScreen() {
  const today = todayBusinessDate();
  const can = useCan();
  const toast = useToast();
  const canReports = can('reports.view');
  const [exporting, setExporting] = useState(false);
  const reportQuery = useQuery({
    queryKey: ['reports', 'daily', today],
    queryFn: () => fetchDailyReport(today),
    enabled: canReports,
  });

  const report = reportQuery.data;

  const exportCsv = (from: string, to: string) => {
    void (async () => {
      setExporting(true);
      try {
        const csv = await fetchReportCsv(from, to);
        const result = await shareFile({
          contents: csv,
          filename: `tiffino-orders-${from}-to-${to}.csv`,
          mimeType: 'text/csv',
          fallbackText: `TIFFINO orders CSV (${from} → ${to}): file sharing failed on this device — download it from the web console's Reports page.`,
        });
        if (result === 'text') {
          toast.show('File sharing failed — download the CSV from the web console instead.', 'info');
        }
      } catch (err) {
        toast.show(`CSV export failed — ${errorMessage(err)}`, 'error');
      } finally {
        setExporting(false);
      }
    })();
  };

  const [exportingSummary, setExportingSummary] = useState(false);

  /** "Ab tak kisko kitna tiffin gaya" — all-time per-customer ledger CSV. */
  const exportCustomerSummary = () => {
    void (async () => {
      setExportingSummary(true);
      try {
        const csv = await fetchCustomerSummaryCsv();
        const result = await shareFile({
          contents: csv,
          filename: `tiffino-customer-summary-${today}.csv`,
          mimeType: 'text/csv',
          fallbackText:
            "TIFFINO customer summary CSV: file sharing failed on this device — download it from the web console's Reports page.",
        });
        if (result === 'text') {
          toast.show('File sharing failed — download the CSV from the web console instead.', 'info');
        }
      } catch (err) {
        toast.show(`Export failed — ${errorMessage(err)}`, 'error');
      } finally {
        setExportingSummary(false);
      }
    })();
  };

  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const week = rangeForFilter('this-week');
  const month = rangeForFilter('this-month');

  if (!canReports) {
    return (
      <Screen title="Daily report" subtitle={formatBusinessDate(today)}>
        <EmptyState
          title="Reports need extra access"
          message="Ask the owner to grant you report access to see daily totals."
        />
      </Screen>
    );
  }

  return (
    <Screen title="Daily report" subtitle={formatBusinessDate(today)}>
      {reportQuery.isLoading ? (
        <LoadingList rows={5} rowHeight={64} />
      ) : reportQuery.isError ? (
        <ErrorState error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      ) : report ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={reportQuery.isRefetching}
              onRefresh={() => {
                reportQuery.refetch();
              }}
              tintColor="#1b4332"
            />
          }>
          <View className="flex-row flex-wrap justify-between px-4" style={{ rowGap: 10 }}>
            <Cell label="Breakfast" value={String(report.breakfastOrders)} />
            <Cell label="Lunch" value={String(report.lunchOrders)} />
            <Cell label="Dinner" value={String(report.dinnerOrders)} />
            <Cell label="Tiffins" value={String(report.totalTiffins)} />
            <Cell label="Breakfast ₹" value={formatINR(report.breakfastRevenue)} />
            <Cell label="Lunch ₹" value={formatINR(report.lunchRevenue)} />
            <Cell label="Dinner ₹" value={formatINR(report.dinnerRevenue)} />
            <Cell label="Total ₹" value={formatINR(report.totalRevenue)} />
          </View>
          {report.cancelledOrders > 0 ? (
            <Text className="mt-3 px-4 text-xs font-semibold text-danger">
              {report.cancelledOrders} cancelled today (excluded from totals)
            </Text>
          ) : null}

          <Text className="mt-6 px-4 text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
            Orders
          </Text>
          <View className="mx-4 mt-2.5 rounded-2xl bg-white">
            {report.rows.length === 0 ? (
              <EmptyState title="No orders today yet" />
            ) : (
              report.rows.map((row, idx) => (
                <View
                  key={row.orderId}
                  className={`min-h-[52px] flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-cream' : ''}`}>
                  <View className="mr-2 flex-1">
                    <Text className="text-sm font-bold text-charcoal" numberOfLines={1}>
                      {row.customerName}
                    </Text>
                    <Text className="mt-0.5 text-xs text-charcoal/50">
                      {MEAL_LABELS[row.mealType]}
                      {row.quantity > 1 ? ` ×${row.quantity}` : ''} · {formatINR(row.price)} ·{' '}
                      {row.customerType}
                    </Text>
                  </View>
                  <StatusBadge status={row.status} />
                </View>
              ))
            )}
          </View>

          <View className="mx-4 mt-6">
            <PrimaryButton
              label="⬇︎ DOWNLOAD CSV"
              variant="flame"
              compact
              loading={exporting}
              onPress={() => setExportSheetOpen(true)}
            />
          </View>
          <Text className="mt-2 px-4 text-center text-xs text-charcoal/50">
            Today · week · month — shares as a .csv file
          </Text>
          <View className="mx-4 mt-3">
            <PrimaryButton
              label="⬇︎ CUSTOMER SUMMARY CSV"
              compact
              loading={exportingSummary}
              onPress={exportCustomerSummary}
            />
          </View>
          <Text className="mt-2 px-4 text-center text-xs text-charcoal/50">
            Complete ledger so far — every customer's tiffins, amount, paid and pending
          </Text>
        </ScrollView>
      ) : null}

      <PeriodSheet
        visible={exportSheetOpen}
        title="Download CSV"
        subtitle="The file opens in the share sheet — WhatsApp, Drive, email, anywhere."
        presets={[
          { label: 'Today', from: today, to: today },
          { label: 'Week', from: week.from, to: week.to },
          { label: 'Month', from: month.from, to: month.to },
        ]}
        confirmLabel="Generate CSV"
        onPick={(_label, f, t) => {
          if (f && t) exportCsv(f, t);
        }}
        onClose={() => setExportSheetOpen(false)}
      />
    </Screen>
  );
}
