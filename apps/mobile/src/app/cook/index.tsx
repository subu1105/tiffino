import {
  buildCookInvoiceHtml,
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  todayBusinessDate,
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
import { addCookEntry, deleteCookEntry, fetchCookLedger } from '@/lib/queries';
import { PdfReadySheet } from '@/components/pdf-ready-sheet';
import { prepareHtmlFile, type ReadyFile } from '@/lib/statement-pdf';
import { Screen } from '@/components/screen';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type RangeKey = 'this-week' | 'this-month' | 'all';
type Kind = 'paid' | 'return';

/** Cook invoice: money handed to the cook every few days, the amounts they
 *  return, and the running net total. */
export default function CookLedgerScreen() {
  const can = useCan();
  const toast = useToast();
  const sheet = useConfirmSheet();
  const queryClient = useQueryClient();
  const today = todayBusinessDate();

  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const range = rangeKey === 'all' ? null : rangeForFilter(rangeKey);

  const ledgerQuery = useQuery({
    queryKey: ['cook-ledger', range?.from ?? 'all', range?.to ?? 'all'],
    queryFn: () => fetchCookLedger(range?.from, range?.to),
    enabled: can('expenses.view'),
  });

  /* ---------------- add-entry sheet ---------------- */

  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('paid');
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [pickingDate, setPickingDate] = useState(false);
  const [formError, setFormError] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cook-ledger'] });

  /* ---------------- PDF share ---------------- */

  const [sharingPdf, setSharingPdf] = useState(false);
  const [pdfSheet, setPdfSheet] = useState<{
    ready: ReadyFile;
    subtitle: string;
    lines: string[];
  } | null>(null);
  const sharePdf = () => {
    void (async () => {
      const data = ledgerQuery.data;
      if (!data) return;
      setSharingPdf(true);
      try {
        const periodLabel =
          rangeKey === 'all'
            ? 'All time'
            : `${formatBusinessDate(range!.from)} – ${formatBusinessDate(range!.to)}`;
        const html = buildCookInvoiceHtml({ periodLabel, ...data });
        const summary = [
          '🍱 TIFFINO — Cook invoice',
          `Period: ${periodLabel}`,
          `Paid: ${formatINR(data.totalPaid)} · Returned: ${formatINR(data.totalReturned)}`,
          `Net total: ${formatINR(data.net)}`,
        ].join('\n');
        const ready = await prepareHtmlFile(html, 'TIFFINO-cook-invoice.pdf', summary);
        setPdfSheet({
          ready,
          subtitle: periodLabel,
          lines: [
            `Paid ${formatINR(data.totalPaid)} − Return ${formatINR(data.totalReturned)}`,
            `Net total: ${formatINR(data.net)}`,
          ],
        });
      } catch (err) {
        toast.show(`PDF failed — ${errorMessage(err)}`, 'error');
      } finally {
        setSharingPdf(false);
      }
    })();
  };

  const saveMutation = useMutation({
    mutationFn: (keepOpen: boolean) => {
      const amountNumber = amount.trim() === '' ? NaN : Number(amount);
      if (Number.isNaN(amountNumber) || amountNumber < 1) {
        setFormError('Enter a whole-rupee amount.');
        throw new Error('validation');
      }
      setFormError('');
      return addCookEntry({ entryDate, kind, amount: amountNumber, notes: notes.trim() }).then(
        (e) => ({ e, keepOpen }),
      );
    },
    onSuccess: ({ e, keepOpen }) => {
      invalidate();
      toast.show(
        e.kind === 'paid'
          ? `Paid ${formatINR(e.amount)} to the cook.`
          : `Cook returned ${formatINR(e.amount)}.`,
        'success',
      );
      setAmount('');
      setNotes('');
      if (!keepOpen) setAddOpen(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      toast.show(errorMessage(err), 'error');
    },
  });

  const confirmDelete = (id: string, label: string) => {
    void (async () => {
      const ok = await sheet.confirm({
        title: 'Delete this entry?',
        message: label,
        cancelLabel: 'Keep it',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await deleteCookEntry(id);
        invalidate();
        toast.show('Entry deleted.', 'success');
      } catch (err) {
        toast.show(errorMessage(err), 'error');
      }
    })();
  };

  if (!can('expenses.view')) {
    return (
      <Screen title="Cook invoice">
        <EmptyState title="No expense access" message="Ask the owner for expense permission." />
      </Screen>
    );
  }

  const ledger = ledgerQuery.data;

  return (
    <Screen title="Cook invoice" subtitle="Money given, returns received — net total below">
      <View className="mt-2 flex-row items-center px-4" style={{ gap: 8 }}>
        <Chip label="Week" selected={rangeKey === 'this-week'} onPress={() => setRangeKey('this-week')} />
        <Chip label="Month" selected={rangeKey === 'this-month'} onPress={() => setRangeKey('this-month')} />
        <Chip label="All" selected={rangeKey === 'all'} onPress={() => setRangeKey('all')} />
        <View className="flex-1" />
        <Pressable
          onPress={sharePdf}
          disabled={sharingPdf}
          accessibilityRole="button"
          accessibilityLabel="Share PDF"
          className="min-h-[36px] items-center justify-center rounded-full bg-forest-800 px-3 active:opacity-90">
          <Text className="text-xs font-extrabold text-cream">{sharingPdf ? '…' : '📄 PDF'}</Text>
        </Pressable>
      </View>

      {can('expenses.record') ? (
        <View className="mx-4 mt-2 flex-row" style={{ gap: 8 }}>
          <Pressable
            onPress={() => {
              setKind('paid');
              setEntryDate(today);
              setAddOpen(true);
            }}
            accessibilityRole="button"
            className="min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-flame-500 active:bg-flame-600">
            <Text className="text-sm font-extrabold text-white">+ PAID TO COOK</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setKind('return');
              setEntryDate(today);
              setAddOpen(true);
            }}
            accessibilityRole="button"
            className="min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-forest-800 active:opacity-90">
            <Text className="text-sm font-extrabold text-cream">+ RETURN RECEIVED</Text>
          </Pressable>
        </View>
      ) : null}

      {ledgerQuery.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={6} rowHeight={56} />
        </View>
      ) : ledgerQuery.isError ? (
        <ErrorState error={ledgerQuery.error} onRetry={() => ledgerQuery.refetch()} />
      ) : (
        <FlatList
          data={ledger?.entries ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 64 }}
          refreshControl={
            <RefreshControl
              refreshing={ledgerQuery.isRefetching}
              onRefresh={() => {
                ledgerQuery.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No entries yet"
              message="Log what you hand to the cook — and what comes back."
            />
          }
          renderItem={({ item: e }) => (
            <View className="mx-4 mb-1.5 flex-row items-center rounded-xl bg-white px-3.5 py-2">
              <View className="mr-2 flex-1">
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-sm font-bold text-charcoal">
                    {formatBusinessDate(e.entryDate)}
                  </Text>
                  <Text
                    className={`overflow-hidden rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      e.kind === 'paid'
                        ? 'bg-flame-100 text-flame-800'
                        : 'bg-forest-100 text-forest-800'
                    }`}>
                    {e.kind === 'paid' ? 'Paid' : 'Return'}
                  </Text>
                </View>
                {e.notes ? (
                  <Text className="mt-0.5 text-xs text-charcoal/45" numberOfLines={1}>
                    {e.notes}
                  </Text>
                ) : null}
              </View>
              <Text
                className={`mr-1.5 text-sm font-extrabold ${
                  e.kind === 'paid' ? 'text-charcoal' : 'text-success'
                }`}>
                {e.kind === 'paid' ? '' : '−'}
                {formatINR(e.amount)}
              </Text>
              {can('expenses.record') ? (
                <Pressable
                  onPress={() =>
                    confirmDelete(
                      e.id,
                      `${formatBusinessDate(e.entryDate)} · ${e.kind} · ${formatINR(e.amount)}`,
                    )
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete entry"
                  className="h-8 w-8 items-center justify-center rounded-lg active:bg-danger/10">
                  <Text className="text-xs text-danger">🗑</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      {/* Sticky net total just above the footer */}
      {ledger ? (
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
            Paid {formatINR(ledger.totalPaid)} − Return {formatINR(ledger.totalReturned)}
          </Text>
          <Text className="text-base font-extrabold text-cream">
            Net {formatINR(ledger.net)}
          </Text>
        </View>
      ) : null}

      <PdfReadySheet
        ready={pdfSheet?.ready ?? null}
        title="Invoice PDF ready ✓"
        subtitle={pdfSheet?.subtitle}
        lines={pdfSheet?.lines}
        onClose={() => setPdfSheet(null)}
      />

      {/* Add-entry sheet */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <Pressable className="flex-1 bg-charcoal/50" accessibilityLabel="Close" onPress={() => setAddOpen(false)} />
          <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
            <Text className="text-lg font-extrabold text-forest-800">
              {kind === 'paid' ? 'Paid to cook' : 'Return from cook'}
            </Text>

            <View className="mt-3 flex-row" style={{ gap: 8 }}>
              <Chip label="Paid" tone="flame" selected={kind === 'paid'} onPress={() => setKind('paid')} />
              <Chip label="Return" selected={kind === 'return'} onPress={() => setKind('return')} />
            </View>

            <Pressable
              onPress={() => setPickingDate(true)}
              accessibilityRole="button"
              className="mt-3 min-h-[52px] justify-center rounded-2xl bg-white px-4">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/45">Date</Text>
              <Text className="mt-0.5 text-sm font-bold text-charcoal">
                {formatBusinessDate(entryDate)}
              </Text>
            </Pressable>

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
                className={`min-h-[50px] flex-1 items-center justify-center rounded-2xl ${kind === 'paid' ? 'bg-flame-500 active:bg-flame-600' : 'bg-forest-800 active:opacity-90'}`}>
                <Text className="text-sm font-extrabold text-white">
                  {saveMutation.isPending ? 'SAVING…' : 'SAVE'}
                </Text>
              </Pressable>
            </View>

            <CalendarSheet
              visible={pickingDate}
              value={entryDate}
              title="Entry date"
              onClose={() => setPickingDate(false)}
              onPick={(d) => {
                setPickingDate(false);
                setEntryDate(d);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
