import {
  createPaymentSchema,
  formatINR,
  todayBusinessDate,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Chip, TypeTag } from '@/components/chip';
import { errorMessage } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ApiError } from '@/lib/api';
import { fetchCustomer, fetchCustomers, fetchStatements, recordPayment } from '@/lib/queries';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};

interface PickedCustomer {
  id: string;
  fullName: string;
  mobile: string;
  type: 'regular' | 'occasional';
}

export default function NewPaymentScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [picked, setPicked] = useState<PickedCustomer | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayBusinessDate());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [statementId, setStatementId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const can = useCan();

  // Open (not fully paid) statements of the picked customer — settle against one.
  const statementsQuery = useQuery({
    queryKey: ['statements', picked?.id ?? 'none'],
    queryFn: () => fetchStatements(picked!.id),
    enabled: Boolean(picked) && can('payments.view'),
  });
  const openStatements = (statementsQuery.data ?? []).filter(
    (s) => s.settlementStatus !== 'settled',
  );

  const toggleStatement = (id: string, due: number) => {
    if (statementId === id) {
      setStatementId('');
      return;
    }
    setStatementId(id);
    // Prefill with what's still due on that statement; stays editable.
    setAmount(String(Math.max(1, due)));
  };

  // Prefill from ?customerId=
  const prefillQuery = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: () => fetchCustomer(customerId as string),
    enabled: Boolean(customerId),
  });
  useEffect(() => {
    const c = prefillQuery.data?.customer;
    if (c) setPicked({ id: c.id, fullName: c.fullName, mobile: c.mobile, type: c.type });
  }, [prefillQuery.data]);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const pickerQuery = useQuery({
    queryKey: ['customers', 'picker', q],
    queryFn: () => fetchCustomers({ q: q || undefined, status: 'active', limit: 10 }),
    enabled: !picked,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!picked) {
        setErrors({ customer: 'Pick a customer first' });
        throw new ApiError('VALIDATION_ERROR', 'Pick a customer first.', 0);
      }
      const candidate = {
        customerId: picked.id,
        amount: amount.trim() === '' ? NaN : Number(amount),
        paymentDate: paymentDate.trim(),
        method,
        notes,
        ...(statementId ? { statementId } : {}),
      };
      const parsed = createPaymentSchema.safeParse(candidate);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          if (!fieldErrors[key]) {
            fieldErrors[key] =
              key === 'amount' && Number.isNaN(candidate.amount)
                ? 'Enter a whole-rupee amount'
                : issue.message;
          }
        }
        setErrors(fieldErrors);
        throw new ApiError('VALIDATION_ERROR', 'Fix the highlighted fields.', 0);
      }
      setErrors({});
      return recordPayment(parsed.data);
    },
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      toast.show(`Recorded ${formatINR(payment.amount)} from ${payment.customerName}.`, 'success');
      router.back();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.status === 0) return;
      toast.show(errorMessage(err), 'error');
    },
  });

  return (
    <Screen title="Record payment">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled">
          {/* Customer */}
          <Text className="mb-1.5 text-[13px] font-bold text-charcoal/70">Customer</Text>
          {picked ? (
            <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-white p-4">
              <View className="mr-2 flex-1">
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="shrink text-base font-bold text-charcoal" numberOfLines={1}>
                    {picked.fullName}
                  </Text>
                  <TypeTag type={picked.type} />
                </View>
                <Text className="mt-0.5 text-xs text-charcoal/50">{picked.mobile}</Text>
              </View>
              {!customerId ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setPicked(null);
                    setSearch('');
                  }}
                  accessibilityRole="button">
                  <Text className="text-sm font-bold text-forest-600">Change</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View className="mb-4">
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search name or mobile…"
                placeholderTextColor="#2B2D2F55"
                autoCapitalize="none"
                className={`min-h-[52px] rounded-2xl bg-white px-4 py-3 text-base text-charcoal ${errors.customer ? 'border border-danger' : ''}`}
              />
              {errors.customer ? (
                <Text className="mt-1 text-xs font-semibold text-danger">{errors.customer}</Text>
              ) : null}
              <View className="mt-2 overflow-hidden rounded-2xl bg-white">
                {pickerQuery.isLoading ? (
                  <ActivityIndicator className="my-4" color="#1b4332" />
                ) : pickerQuery.data && pickerQuery.data.data.length > 0 ? (
                  pickerQuery.data.data.map((c, idx) => (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setPicked({ id: c.id, fullName: c.fullName, mobile: c.mobile, type: c.type });
                        setErrors((e) => ({ ...e, customer: '' }));
                      }}
                      className={`min-h-[48px] flex-row items-center justify-between px-4 py-2.5 active:bg-cream ${idx > 0 ? 'border-t border-cream' : ''}`}>
                      <Text className="mr-2 flex-1 text-sm font-semibold text-charcoal" numberOfLines={1}>
                        {c.fullName}
                      </Text>
                      <Text className="text-xs text-charcoal/50">{c.mobile}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text className="p-4 text-sm text-charcoal/50">
                    {q ? 'No active customers match.' : 'Type to search active customers.'}
                  </Text>
                )}
              </View>
            </View>
          )}

          {picked && openStatements.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-1.5 text-[13px] font-bold text-charcoal/70">
                Settle against statement (optional — tap to select)
              </Text>
              <View className="overflow-hidden rounded-2xl bg-white">
                {openStatements.map((s, idx) => {
                  const due = Math.max(0, s.pending - s.receivedSince);
                  const selected = statementId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => toggleStatement(s.id, due)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`min-h-[52px] flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-cream' : ''} ${selected ? 'bg-forest-50' : 'active:bg-cream'}`}>
                      <View className="mr-2 flex-1">
                        <Text className="text-sm font-bold text-charcoal" numberOfLines={1}>
                          {selected ? '✓ ' : ''}
                          {s.periodLabel}
                        </Text>
                        <Text className="mt-0.5 text-xs text-charcoal/55">
                          due {formatINR(due)}
                          {s.settlementStatus === 'partial'
                            ? ` · ${formatINR(s.receivedSince)} already received`
                            : ''}
                        </Text>
                      </View>
                      <Text
                        className={`text-xs font-bold ${selected ? 'text-forest-700' : 'text-charcoal/35'}`}>
                        {selected ? 'SELECTED' : 'TAP'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {statementId ? (
                <Text className="mt-1 text-[11px] text-charcoal/50">
                  This payment will mark that statement Paid/Partial automatically.
                </Text>
              ) : null}
            </View>
          ) : null}

          <FormField
            label="Amount (₹)"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              if (errors.amount) setErrors((e) => ({ ...e, amount: '' }));
            }}
            placeholder="500"
            keyboardType="number-pad"
            error={errors.amount}
          />

          <FormField
            label="Payment date (YYYY-MM-DD)"
            value={paymentDate}
            onChangeText={(v) => {
              setPaymentDate(v);
              if (errors.paymentDate) setErrors((e) => ({ ...e, paymentDate: '' }));
            }}
            placeholder={todayBusinessDate()}
            autoCapitalize="none"
            error={errors.paymentDate}
          />

          <Text className="mb-1.5 text-[13px] font-bold text-charcoal/70">Method</Text>
          <View className="mb-4 flex-row flex-wrap" style={{ gap: 8 }}>
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} label={METHOD_LABELS[m]} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>

          <FormField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. October dues (optional)"
            multiline
            error={errors.notes}
          />

          <PrimaryButton
            label="Save payment"
            loading={submitMutation.isPending}
            onPress={() => submitMutation.mutate()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
