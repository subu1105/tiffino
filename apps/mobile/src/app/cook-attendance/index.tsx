import {
  buildCookAttendanceHtml,
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
import { Screen } from '@/components/screen';
import {
  deleteCookAttendance,
  fetchCookAttendance,
  markCookAttendance,
} from '@/lib/queries';
import { PdfReadySheet } from '@/components/pdf-ready-sheet';
import { prepareHtmlFile, type ReadyFile } from '@/lib/statement-pdf';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type RangeKey = 'this-week' | 'this-month' | 'all';
type Status = 'worked' | 'half-day' | 'leave';

const STATUS_LABEL: Record<Status, string> = {
  worked: 'Worked',
  'half-day': 'Half day',
  leave: 'Leave',
};

/** Cook attendance: worked / half-day / leave per date — wages flow into P&L. */
export default function CookAttendanceScreen() {
  const can = useCan();
  const toast = useToast();
  const sheet = useConfirmSheet();
  const queryClient = useQueryClient();
  const today = todayBusinessDate();

  const [rangeKey, setRangeKey] = useState<RangeKey>('this-month');
  const range = rangeKey === 'all' ? null : rangeForFilter(rangeKey);

  const query = useQuery({
    queryKey: ['cook-attendance', range?.from ?? 'all', range?.to ?? 'all'],
    queryFn: () => fetchCookAttendance(range?.from, range?.to),
    enabled: can('expenses.view'),
  });
  const attendance = query.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cook-attendance'] });
    // Worked/half days are a P&L cost — refresh every profit figure.
    queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
  };

  /* ---------------- marking ---------------- */

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<Status>('worked');
  const [rate, setRate] = useState('');
  const [pickingDate, setPickingDate] = useState(false);
  const [formError, setFormError] = useState('');

  const markMutation = useMutation({
    mutationFn: (input: { date: string; status: Status; dailyRate?: number }) =>
      markCookAttendance(input),
    onSuccess: (entry) => {
      invalidate();
      toast.show(
        entry.status === 'leave'
          ? `${formatBusinessDate(entry.date)}: marked as leave.`
          : `${formatBusinessDate(entry.date)}: ${STATUS_LABEL[entry.status].toLowerCase()} · ${formatINR(entry.dailyRate)} counted in P&L.`,
        'success',
      );
      setOpen(false);
    },
    onError: (err) => toast.show(errorMessage(err), 'error'),
  });

  // Sensible wage to pre-fill: last full wage (default ₹600), halved for half days.
  const defaultRateFor = (s: Status) => {
    const full = attendance?.lastRate || 600;
    return s === 'half-day' ? Math.round(full / 2) : full;
  };

  const quickMark = (s: Status) => {
    if (s === 'leave') {
      markMutation.mutate({ date: today, status: 'leave' });
      return;
    }
    if (attendance?.lastRate) {
      markMutation.mutate({ date: today, status: s, dailyRate: defaultRateFor(s) });
    } else {
      // First time: confirm the wage (pre-filled with the usual amount).
      setDate(today);
      setStatus(s);
      setRate(String(defaultRateFor(s)));
      setOpen(true);
    }
  };

  const openCustom = () => {
    setDate(today);
    setStatus('worked');
    setRate(String(defaultRateFor('worked')));
    setOpen(true);
  };

  const pickStatus = (s: Status) => {
    setStatus(s);
    if (s !== 'leave') setRate(String(defaultRateFor(s)));
  };

  const save = () => {
    const n = rate.trim() === '' ? NaN : Number(rate);
    if (status !== 'leave' && (Number.isNaN(n) || n < 1)) {
      setFormError('Enter the wage for this day.');
      return;
    }
    setFormError('');
    markMutation.mutate({
      date,
      status,
      ...(status !== 'leave' ? { dailyRate: n } : {}),
    });
  };

  const confirmDelete = (id: string, label: string) => {
    void (async () => {
      const ok = await sheet.confirm({
        title: 'Remove this day?',
        message: label,
        cancelLabel: 'Keep it',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await deleteCookAttendance(id);
        invalidate();
        toast.show('Day removed.', 'success');
      } catch (err) {
        toast.show(errorMessage(err), 'error');
      }
    })();
  };

  /* ---------------- PDF share ---------------- */

  const [sharing, setSharing] = useState(false);
  const [pdfSheet, setPdfSheet] = useState<{
    ready: ReadyFile;
    subtitle: string;
    lines: string[];
  } | null>(null);
  const sharePdf = () => {
    void (async () => {
      if (!attendance) return;
      setSharing(true);
      try {
        const periodLabel =
          rangeKey === 'all'
            ? 'All time'
            : `${formatBusinessDate(range!.from)} – ${formatBusinessDate(range!.to)}`;
        const html = buildCookAttendanceHtml({ periodLabel, ...attendance });
        const summary = [
          '🍱 TIFFINO — Cook attendance',
          `Period: ${periodLabel}`,
          `Worked: ${attendance.workedDays} days · Half days: ${attendance.halfDays} · Leave: ${attendance.leaveDays} days`,
          `Total wages: ${formatINR(attendance.wageTotal)}`,
        ].join('\n');
        const ready = await prepareHtmlFile(html, 'TIFFINO-cook-attendance.pdf', summary);
        setPdfSheet({
          ready,
          subtitle: periodLabel,
          lines: [
            `Worked ${attendance.workedDays} · Half ${attendance.halfDays} · Leave ${attendance.leaveDays}`,
            `Total wages: ${formatINR(attendance.wageTotal)}`,
          ],
        });
      } catch (err) {
        toast.show(`PDF failed — ${errorMessage(err)}`, 'error');
      } finally {
        setSharing(false);
      }
    })();
  };

  if (!can('expenses.view')) {
    return (
      <Screen title="Cook attendance">
        <EmptyState title="No expense access" message="Ask the owner for expense permission." />
      </Screen>
    );
  }

  return (
    <Screen title="Cook attendance" subtitle="Worked, half days & leave — wages join P&L">
      <View className="mt-2 flex-row items-center px-4" style={{ gap: 8 }}>
        <Chip label="Week" selected={rangeKey === 'this-week'} onPress={() => setRangeKey('this-week')} />
        <Chip label="Month" selected={rangeKey === 'this-month'} onPress={() => setRangeKey('this-month')} />
        <Chip label="All" selected={rangeKey === 'all'} onPress={() => setRangeKey('all')} />
        <View className="flex-1" />
        <Pressable
          onPress={sharePdf}
          disabled={sharing}
          accessibilityRole="button"
          accessibilityLabel="Share PDF"
          className="min-h-[36px] items-center justify-center rounded-full bg-forest-800 px-3 active:opacity-90">
          <Text className="text-xs font-extrabold text-cream">{sharing ? '…' : '📄 PDF'}</Text>
        </Pressable>
      </View>

      {can('expenses.record') ? (
        <View className="mx-4 mt-2 flex-row" style={{ gap: 8 }}>
          <Pressable
            onPress={() => quickMark('worked')}
            disabled={markMutation.isPending}
            accessibilityRole="button"
            className="min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-forest-800 active:opacity-90">
            <Text className="text-xs font-extrabold text-cream">✓ WORKED</Text>
          </Pressable>
          <Pressable
            onPress={() => quickMark('half-day')}
            disabled={markMutation.isPending}
            accessibilityRole="button"
            className="min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-flame-500 active:bg-flame-600">
            <Text className="text-xs font-extrabold text-white">◐ HALF DAY</Text>
          </Pressable>
          <Pressable
            onPress={() => quickMark('leave')}
            disabled={markMutation.isPending}
            accessibilityRole="button"
            className="min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-danger/10 active:bg-danger/20">
            <Text className="text-xs font-extrabold text-danger">✗ LEAVE</Text>
          </Pressable>
          <Pressable
            onPress={openCustom}
            accessibilityRole="button"
            accessibilityLabel="Mark another day"
            className="min-h-[44px] w-11 items-center justify-center rounded-2xl bg-white active:bg-forest-50">
            <Text className="text-sm">📅</Text>
          </Pressable>
        </View>
      ) : null}
      <Text className="mt-1.5 px-4 text-[10px] text-charcoal/40">
        Buttons mark TODAY. Use 📅 for another day — re-marking a day corrects it.
      </Text>

      {query.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={6} rowHeight={48} />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={attendance?.days ?? []}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 64 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                query.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No days marked yet"
              message="Mark today with the buttons above — wages join P&L automatically."
            />
          }
          renderItem={({ item: d }) => (
            <View className="mx-4 mb-1.5 flex-row items-center rounded-xl bg-white px-3.5 py-2">
              <Text className="flex-1 text-sm font-bold text-charcoal">
                {formatBusinessDate(d.date)}
              </Text>
              <Text
                className={`mr-2 overflow-hidden rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  d.status === 'worked'
                    ? 'bg-forest-100 text-forest-800'
                    : d.status === 'half-day'
                      ? 'bg-flame-100 text-flame-800'
                      : 'bg-danger/10 text-danger'
                }`}>
                {STATUS_LABEL[d.status]}
              </Text>
              <Text className="mr-1.5 text-sm font-extrabold text-charcoal">
                {d.status === 'leave' ? '—' : formatINR(d.dailyRate)}
              </Text>
              {can('expenses.record') ? (
                <Pressable
                  onPress={() =>
                    confirmDelete(
                      d.id,
                      `${formatBusinessDate(d.date)} · ${STATUS_LABEL[d.status]}${d.status === 'leave' ? '' : ` · ${formatINR(d.dailyRate)}`}`,
                    )
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove day"
                  className="h-8 w-8 items-center justify-center rounded-lg active:bg-danger/10">
                  <Text className="text-xs text-danger">🗑</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      {/* Sticky counters just above the footer */}
      {attendance ? (
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
            W {attendance.workedDays} · H {attendance.halfDays} · L {attendance.leaveDays}
          </Text>
          <Text className="text-base font-extrabold text-cream">
            Wages {formatINR(attendance.wageTotal)}
          </Text>
        </View>
      ) : null}

      <PdfReadySheet
        ready={pdfSheet?.ready ?? null}
        title="Attendance PDF ready ✓"
        subtitle={pdfSheet?.subtitle}
        lines={pdfSheet?.lines}
        onClose={() => setPdfSheet(null)}
      />

      {/* Marking sheet */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <Pressable className="flex-1 bg-charcoal/50" accessibilityLabel="Close" onPress={() => setOpen(false)} />
          <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
            <Text className="text-lg font-extrabold text-forest-800">Mark attendance</Text>
            <Text className="mt-0.5 text-xs text-charcoal/55">
              Re-marking the same day simply corrects it.
            </Text>

            <View className="mt-3 flex-row" style={{ gap: 8 }}>
              <Chip label="Worked" selected={status === 'worked'} onPress={() => pickStatus('worked')} />
              <Chip label="Half day" tone="flame" selected={status === 'half-day'} onPress={() => pickStatus('half-day')} />
              <Chip label="Leave" tone="neutral" selected={status === 'leave'} onPress={() => pickStatus('leave')} />
            </View>

            <Pressable
              onPress={() => setPickingDate(true)}
              accessibilityRole="button"
              className="mt-3 min-h-[52px] justify-center rounded-2xl bg-white px-4">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/45">Date</Text>
              <Text className="mt-0.5 text-sm font-bold text-charcoal">
                {formatBusinessDate(date)}
              </Text>
            </Pressable>

            {status !== 'leave' ? (
              <TextInput
                value={rate}
                onChangeText={setRate}
                placeholder={status === 'half-day' ? 'Half-day wage (₹) — e.g. 300' : 'Daily wage (₹) — e.g. 600'}
                placeholderTextColor="#2B2D2F55"
                keyboardType="number-pad"
                className="mt-2.5 min-h-[52px] rounded-2xl bg-white px-4 text-base text-charcoal"
              />
            ) : null}
            {formError ? (
              <Text className="mt-1.5 text-xs font-semibold text-danger">{formError}</Text>
            ) : null}

            <View className="mt-4">
              <Pressable
                onPress={save}
                disabled={markMutation.isPending}
                accessibilityRole="button"
                className="min-h-[50px] items-center justify-center rounded-2xl bg-forest-800 active:opacity-90">
                <Text className="text-sm font-extrabold text-cream">
                  {markMutation.isPending ? 'SAVING…' : 'SAVE'}
                </Text>
              </Pressable>
            </View>

            <CalendarSheet
              visible={pickingDate}
              value={date}
              title="Attendance date"
              onClose={() => setPickingDate(false)}
              onPick={(d) => {
                setPickingDate(false);
                setDate(d);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
