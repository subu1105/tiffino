import {
  formatBusinessDate,
  formatINR,
  toBusinessDate,
  type StatementDTO,
} from '@tiffino/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { SettlementTag } from '@/components/chip';
import { useConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, errorMessage } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { Screen } from '@/components/screen';
import { StatementReadySheet } from '@/components/statement-ready-sheet';
import {
  deleteStatement,
  fetchCustomer,
  fetchCustomerPayments,
  fetchOrders,
  fetchCustomerOrdersReport,
  fetchStatements,
} from '@/lib/queries';
import { prepareStatementFile, type ReadyStatement } from '@/lib/statement-pdf';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

/** Every generated statement, customer-name-wise — the owner's proof ledger of
 *  what was billed to whom and what was pending at that moment. */
export default function StatementsScreen() {
  const can = useCan();
  const toast = useToast();
  const sheet = useConfirmSheet();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState<ReadyStatement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['statements', 'all'],
    queryFn: () => fetchStatements(),
    enabled: can('payments.view'),
  });

  const viewStatement = (record: StatementDTO) => {
    void (async () => {
      setBusyId(record.id);
      try {
        const [detail, pays, orders] = await Promise.all([
          fetchCustomer(record.customerId),
          fetchCustomerPayments(record.customerId),
          can('reports.view')
            ? fetchCustomerOrdersReport({
                customerId: record.customerId,
                from: record.from ?? undefined,
                to: record.to ?? undefined,
              }).then((r) => r.orders)
            : fetchOrders({
                customerId: record.customerId,
                from: record.from ?? undefined,
                to: record.to ?? undefined,
                limit: 100,
              }).then((r) => r.data),
        ]);
        setReady(
          await prepareStatementFile({
            record,
            customer: {
              fullName: detail.customer.fullName,
              mobile: detail.customer.mobile,
              type: detail.customer.type,
            },
            orders,
            payments: pays.payments,
          }),
        );
      } catch (err) {
        toast.show(`Could not open statement — ${errorMessage(err)}`, 'error');
      } finally {
        setBusyId(null);
      }
    })();
  };

  const confirmDelete = (record: StatementDTO) => {
    void (async () => {
      const ok = await sheet.confirm({
        title: 'Delete this statement record?',
        message: `${record.customerName} · ${record.periodLabel} · ${formatINR(record.periodAmount)} — this only removes the record, not any orders or payments.`,
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

  if (!can('payments.view')) {
    return (
      <Screen title="Statements">
        <EmptyState
          title="No payments access"
          message="Ask the owner for payment viewing permission."
        />
      </Screen>
    );
  }

  const rows = listQuery.data ?? [];

  return (
    <Screen title="Statements" subtitle="Every statement sent, customer-wise">
      {listQuery.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={6} rowHeight={72} />
        </View>
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={listQuery.isRefetching}
              onRefresh={() => {
                listQuery.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No statements yet"
              message="Generate one from a customer's Payments section."
            />
          }
          renderItem={({ item: s, index }) => {
            const firstOfCustomer = index === 0 || rows[index - 1]?.customerName !== s.customerName;
            return (
              <View className="mx-4">
                {firstOfCustomer ? (
                  <Text className="mb-1.5 mt-3 text-[11px] font-extrabold uppercase tracking-wider text-forest-700">
                    {s.customerName}
                  </Text>
                ) : null}
                <View className="mb-2 flex-row items-center rounded-2xl bg-white">
                  <Pressable
                    onPress={() => viewStatement(s)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`View statement ${s.periodLabel}`}
                    className="min-h-[60px] flex-1 justify-center px-4 py-3 active:bg-forest-50">
                    <View className="flex-row items-center justify-between">
                      <Text className="mr-2 flex-1 text-sm font-bold text-charcoal" numberOfLines={1}>
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
                      {busyId === s.id ? 'Opening…' : 'Tap to view / resend'}
                    </Text>
                  </Pressable>
                  {can('payments.record') ? (
                    <Pressable
                      onPress={() => confirmDelete(s)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete statement ${s.periodLabel}`}
                      className="h-11 w-11 items-center justify-center rounded-xl active:bg-danger/10">
                      <Text className="text-base font-bold text-danger">🗑</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <StatementReadySheet ready={ready} onClose={() => setReady(null)} />
    </Screen>
  );
}
