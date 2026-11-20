import {
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  todayBusinessDate,
  type DateRange,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CalendarSheet } from '@/components/calendar-sheet';
import { Chip } from '@/components/chip';
import { useConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, errorMessage } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { PeriodSheet } from '@/components/period-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { addExpense, deleteExpense, fetchExpenseBook, fetchExpenseCsv } from '@/lib/queries';
import { shareFile } from '@/lib/share-file';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type RangeKey = 'this-week' | 'this-month' | 'custom';

/** The kharcha book: every day's expense items with totals, plus fast entry. */
export default function ExpensesScreen() {
  const can = useCan();
  const toast = useToast();
  const sheet = useConfirmSheet();
  const queryClient = useQueryClient();
  const today = todayBusinessDate();

  const [rangeKey, setRangeKey] = useState<RangeKey>('this-week');
  useRefreshOnFocus(['expenses']);
  const [customRange, setCustomRange] = useState<DateRange>({ from: today, to: today });
  const [customOpen, setCustomOpen] = useState(false);
  const range: DateRange =
    rangeKey === 'custom' ? customRange : rangeForFilter(rangeKey);

  const bookQuery = useQuery({
    queryKey: ['expenses', 'book', range.from, range.to],
    queryFn: () => fetchExpenseBook(range.from, range.to),
    enabled: can('expenses.view'),
  });

  /* ---------------- add-expense sheet ---------------- */

  const [addOpen, setAddOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState(today);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [pickingDate, setPickingDate] = useState(false);
  const [formError, setFormError] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
  };

  const saveMutation = useMutation({
    mutationFn: (keepOpen: boolean) => {
      const amountNumber = amount.trim() === '' ? NaN : Number(amount);
      if (!item.trim() || Number.isNaN(amountNumber) || amountNumber < 1) {
        setFormError('Both an item name and a whole-rupee amount are required.');
        throw new Error('validation');
      }
      setFormError('');
      return addExpense({
        expenseDate,
        item: item.trim(),
        amount: amountNumber,
        notes: notes.trim(),
      }).then((e) => ({ e, keepOpen }));
    },
    onSuccess: ({ e, keepOpen }) => {
      invalidate();
      toast.show(`${e.item} — ${formatINR(e.amount)} added.`, 'success');
      setItem('');
      setAmount('');
      setNotes('');
      if (!keepOpen) setAddOpen(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      toast.show(errorMessage(err), 'error');
    },
  });

  const confirmDelete = (id: string, label: string, value: number) => {
    void (async () => {
      const ok = await sheet.confirm({
        title: 'Delete this expense?',
        message: `${label} · ${formatINR(value)}`,
        cancelLabel: 'Keep it',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await deleteExpense(id);
        invalidate();
        toast.show('Expense deleted.', 'success');
      } catch (err) {
        toast.show(errorMessage(err), 'error');
      }
    })();
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = () => {
    void (async () => {
      setExporting(true);
      try {
        const csv = await fetchExpenseCsv(range.from, range.to);
        const result = await shareFile({
          contents: csv,
          filename: `tiffino-expenses-${range.from}-to-${range.to}.csv`,
          mimeType: 'text/csv',
          fallbackText: 'TIFFINO expenses CSV: file sharing failed — use the web console instead.',
        });
        if (result === 'text') {
          toast.show('File sharing failed — download from the web console instead.', 'info');
        }
      } catch (err) {
        toast.show(`Export failed — ${errorMessage(err)}`, 'error');
      } finally {
        setExporting(false);
      }
    })();
  };

  if (!can('expenses.view')) {
    return (
      <Screen title="Expense book">
        <EmptyState title="No expense access" message="Ask the owner for expense permission." />
      </Screen>
    );
  }

  const days = bookQuery.data?.days ?? [];

  return (
    <Screen
      title="Expense book"
      subtitle={`${formatBusinessDate(range.from)} – ${formatBusinessDate(range.to)}`}>
      {/* Range chips + CSV — one slim row */}
      <View className="mt-2 flex-row items-center px-4" style={{ gap: 8 }}>
        <Chip label="Week" selected={rangeKey === 'this-week'} onPress={() => setRangeKey('this-week')} />
        <Chip label="Month" selected={rangeKey === 'this-month'} onPress={() => setRangeKey('this-month')} />
        <Chip label="Custom" selected={rangeKey === 'custom'} onPress={() => setCustomOpen(true)} />
        <View className="flex-1" />
        <Pressable
          onPress={exportCsv}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Download CSV"
          className="min-h-[36px] items-center justify-center rounded-full bg-forest-800 px-3 active:opacity-90">
          <Text className="text-xs font-extrabold text-cream">{exporting ? '…' : '⬇ CSV'}</Text>
        </Pressable>
      </View>

      {can('expenses.record') ? (
        <View className="mx-4 mt-2">
          <PrimaryButton
            label="+ ADD EXPENSE"
            variant="flame"
            compact
            onPress={() => {
              setExpenseDate(today);
              setAddOpen(true);
            }}
          />
        </View>
      ) : null}

      {/* The book */}
      {bookQuery.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={5} rowHeight={96} />
        </View>
      ) : bookQuery.isError ? (
        <ErrorState error={bookQuery.error} onRetry={() => bookQuery.refetch()} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(d) => d.date}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl
              refreshing={bookQuery.isRefetching}
              onRefresh={() => {
                bookQuery.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No expenses in this range"
              message="Add today's expenses with the button above."
            />
          }
          renderItem={({ item: day }) => (
            <View className="mx-4 mb-3 overflow-hidden rounded-2xl bg-white">
              <View className="flex-row items-center justify-between bg-forest-50 px-4 py-1.5">
                <Text className="text-sm font-extrabold text-forest-800">
                  {formatBusinessDate(day.date)}
                </Text>
                <Text className="text-sm font-extrabold text-forest-800">
                  {formatINR(day.total)}
                </Text>
              </View>
              {day.items.map((e, idx) => (
                <View
                  key={e.id}
                  className={`flex-row items-center px-4 py-1.5 ${idx > 0 ? 'border-t border-cream' : ''}`}>
                  <View className="mr-2 flex-1">
                    <Text className="text-sm font-semibold text-charcoal" numberOfLines={1}>
                      {e.item}
                    </Text>
                    {e.notes ? (
                      <Text className="mt-0.5 text-xs text-charcoal/45" numberOfLines={1}>
                        {e.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="mr-2 text-sm font-bold text-charcoal">{formatINR(e.amount)}</Text>
                  {can('expenses.record') ? (
                    <Pressable
                      onPress={() => confirmDelete(e.id, e.item, e.amount)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${e.item}`}
                      className="h-9 w-9 items-center justify-center rounded-lg active:bg-danger/10">
                      <Text className="text-sm text-danger">🗑</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        />
      )}

      {/* Sticky total: one slim line just above the footer, follows the filter */}
      {bookQuery.data ? (
        <View
          className="absolute bottom-2 left-4 right-4 flex-row items-center justify-between rounded-xl bg-forest-800 px-3.5 py-2"
          style={{
            shadowColor: '#0b2118',
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}>
          <Text className="text-[11px] font-bold uppercase tracking-wider text-forest-200">
            {rangeKey === 'this-week'
              ? 'Week'
              : rangeKey === 'this-month'
                ? 'Month'
                : 'Custom'}{' '}
            · {bookQuery.data.days.reduce((s, d) => s + d.items.length, 0)} items
          </Text>
          <Text className="text-base font-extrabold text-cream">
            {formatINR(bookQuery.data.grandTotal)}
          </Text>
        </View>
      ) : null}

      {/* Custom range picker */}
      <PeriodSheet
        visible={customOpen}
        title="Expense book range"
        confirmLabel="Show expenses"
        onPick={(_label, f, t) => {
          if (f && t) {
            setCustomRange({ from: f, to: t });
            setRangeKey('custom');
          }
        }}
        onClose={() => setCustomOpen(false)}
      />

      {/* Add-expense sheet */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <Pressable className="flex-1 bg-charcoal/50" accessibilityLabel="Close" onPress={() => setAddOpen(false)} />
          <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
            <Text className="text-lg font-extrabold text-forest-800">Add expense</Text>

            <Pressable
              onPress={() => setPickingDate(true)}
              accessibilityRole="button"
              className="mt-3 min-h-[52px] justify-center rounded-2xl bg-white px-4">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/45">Date</Text>
              <Text className="mt-0.5 text-sm font-bold text-charcoal">
                {formatBusinessDate(expenseDate)}
              </Text>
            </Pressable>

            <TextInput
              value={item}
              onChangeText={setItem}
              placeholder="Item — e.g. Sabzi, Gas, Atta…"
              placeholderTextColor="#2B2D2F55"
              className="mt-2.5 min-h-[52px] rounded-2xl bg-white px-4 text-base text-charcoal"
            />
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (₹)"
              placeholderTextColor="#2B2D2F55"
              keyboardType="number-pad"
              className="mt-2.5 min-h-[52px] rounded-2xl bg-white px-4 text-base text-charcoal"
            />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              placeholderTextColor="#2B2D2F55"
              className="mt-2.5 min-h-[52px] rounded-2xl bg-white px-4 text-base text-charcoal"
            />
            {formError ? (
              <Text className="mt-1.5 text-xs font-semibold text-danger">{formError}</Text>
            ) : null}

            <View className="mt-4 flex-row" style={{ gap: 10 }}>
              <Pressable
                onPress={() => saveMutation.mutate(true)}
                disabled={saveMutation.isPending}
                accessibilityRole="button"
                className="min-h-[50px] flex-1 items-center justify-center rounded-2xl bg-white active:bg-forest-50">
                <Text className="text-sm font-bold text-forest-700">SAVE + ADD MORE</Text>
              </Pressable>
              <Pressable
                onPress={() => saveMutation.mutate(false)}
                disabled={saveMutation.isPending}
                accessibilityRole="button"
                className="min-h-[50px] flex-1 items-center justify-center rounded-2xl bg-flame-500 active:bg-flame-600">
                <Text className="text-sm font-extrabold text-white">
                  {saveMutation.isPending ? 'SAVING…' : 'SAVE'}
                </Text>
              </Pressable>
            </View>

            <CalendarSheet
              visible={pickingDate}
              value={expenseDate}
              title="Expense date"
              onClose={() => setPickingDate(false)}
              onPick={(d) => {
                setPickingDate(false);
                setExpenseDate(d);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
