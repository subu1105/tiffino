import { createCustomerSchema, todayBusinessDate, type CustomerType } from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Chip } from '@/components/chip';
import { ErrorState, errorMessage } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { LoadingList } from '@/components/loading-list';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ApiError } from '@/lib/api';
import {
  createCustomer,
  fetchCustomer,
  updateCustomer,
  updateCustomerPrices,
} from '@/lib/queries';
import { useToast } from '@/providers/toast';

interface FormState {
  fullName: string;
  mobile: string;
  address: string;
  type: CustomerType;
  breakfastPrice: string;
  lunchPrice: string;
  dinnerPrice: string;
  joiningDate: string;
  notes: string;
}

const EMPTY: FormState = {
  fullName: '',
  mobile: '',
  address: '',
  type: 'regular',
  breakfastPrice: '',
  lunchPrice: '',
  dinnerPrice: '',
  joiningDate: todayBusinessDate(),
  notes: '',
};

export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedPrices, setLoadedPrices] = useState<{
    breakfast: number;
    lunch: number;
    dinner: number;
  } | null>(null);

  const detailQuery = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => fetchCustomer(id as string),
    enabled: isEdit,
  });

  useEffect(() => {
    const c = detailQuery.data?.customer;
    if (c) {
      setForm({
        fullName: c.fullName,
        mobile: c.mobile,
        address: c.address,
        type: c.type,
        breakfastPrice: c.breakfastPrice > 0 ? String(c.breakfastPrice) : '',
        lunchPrice: String(c.lunchPrice),
        dinnerPrice: String(c.dinnerPrice),
        joiningDate: c.joiningDate,
        notes: c.notes,
      });
      setLoadedPrices({ breakfast: c.breakfastPrice, lunch: c.lunchPrice, dinner: c.dinnerPrice });
    }
  }, [detailQuery.data]);

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const candidate = {
        fullName: form.fullName,
        mobile: form.mobile,
        address: form.address,
        type: form.type,
        // Blank breakfast = customer doesn't take breakfast (price 0).
        breakfastPrice: form.breakfastPrice.trim() === '' ? 0 : Number(form.breakfastPrice),
        lunchPrice: form.lunchPrice.trim() === '' ? NaN : Number(form.lunchPrice),
        dinnerPrice: form.dinnerPrice.trim() === '' ? NaN : Number(form.dinnerPrice),
        joiningDate: form.joiningDate.trim(),
        status: 'active' as const,
        notes: form.notes,
      };
      const parsed = createCustomerSchema.safeParse(candidate);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          if (!fieldErrors[key]) {
            fieldErrors[key] =
              (key === 'lunchPrice' || key === 'dinnerPrice') && Number.isNaN(candidate[key as 'lunchPrice'])
                ? 'Enter a whole-rupee price'
                : issue.message;
          }
        }
        setErrors(fieldErrors);
        throw new ApiError('VALIDATION_ERROR', 'Fix the highlighted fields.', 0);
      }
      setErrors({});
      const data = parsed.data;

      if (!isEdit) {
        return createCustomer(data);
      }

      // Edit: non-price fields via PUT; prices via PUT /prices only when changed.
      const customer = await updateCustomer(id as string, {
        fullName: data.fullName,
        mobile: data.mobile,
        address: data.address,
        type: data.type,
        joiningDate: data.joiningDate,
        notes: data.notes,
      });
      if (
        loadedPrices &&
        (loadedPrices.breakfast !== data.breakfastPrice ||
          loadedPrices.lunch !== data.lunchPrice ||
          loadedPrices.dinner !== data.dinnerPrice)
      ) {
        await updateCustomerPrices(id as string, {
          breakfastPrice: data.breakfastPrice,
          lunchPrice: data.lunchPrice,
          dinnerPrice: data.dinnerPrice,
        });
      }
      return customer;
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.show(isEdit ? `${customer.fullName} updated.` : `${customer.fullName} added.`, 'success');
      router.back();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.status === 0) return; // inline errors shown
      toast.show(errorMessage(err), 'error');
    },
  });

  if (isEdit && detailQuery.isLoading) {
    return (
      <Screen title="Edit customer">
        <LoadingList rows={4} rowHeight={72} />
      </Screen>
    );
  }

  if (isEdit && detailQuery.isError) {
    return (
      <Screen title="Edit customer">
        <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen title={isEdit ? 'Edit customer' : 'New customer'}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled">
          <FormField
            label="Full name"
            value={form.fullName}
            onChangeText={set('fullName')}
            placeholder="e.g. Anita Shah"
            autoCapitalize="words"
            autoComplete="name"
            error={errors.fullName}
          />
          <FormField
            label="Mobile"
            value={form.mobile}
            onChangeText={set('mobile')}
            placeholder="10-digit mobile"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={errors.mobile}
          />
          <FormField
            label="Address"
            value={form.address}
            onChangeText={set('address')}
            placeholder="Delivery address (optional)"
            multiline
            error={errors.address}
          />

          <Text className="mb-1.5 text-[13px] font-bold text-charcoal/70">Customer type</Text>
          <View className="mb-4 flex-row" style={{ gap: 8 }}>
            <Chip
              label="Regular"
              selected={form.type === 'regular'}
              onPress={() => setForm((f) => ({ ...f, type: 'regular' }))}
            />
            <Chip
              label="Occasional"
              selected={form.type === 'occasional'}
              tone="flame"
              onPress={() => setForm((f) => ({ ...f, type: 'occasional' }))}
            />
          </View>

          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1">
              <FormField
                label="Breakfast (₹)"
                value={form.breakfastPrice}
                onChangeText={set('breakfastPrice')}
                placeholder="skip if none"
                keyboardType="number-pad"
                error={errors.breakfastPrice}
              />
            </View>
            <View className="flex-1">
              <FormField
                label="Lunch (₹)"
                value={form.lunchPrice}
                onChangeText={set('lunchPrice')}
                placeholder="80"
                keyboardType="number-pad"
                error={errors.lunchPrice}
              />
            </View>
            <View className="flex-1">
              <FormField
                label="Dinner (₹)"
                value={form.dinnerPrice}
                onChangeText={set('dinnerPrice')}
                placeholder="90"
                keyboardType="number-pad"
                error={errors.dinnerPrice}
              />
            </View>
          </View>
          {isEdit ? (
            <Text className="-mt-2 mb-4 text-xs text-charcoal/50">
              Price changes are saved to the customer's price history.
            </Text>
          ) : null}

          <FormField
            label="Joining date (YYYY-MM-DD)"
            value={form.joiningDate}
            onChangeText={set('joiningDate')}
            placeholder={todayBusinessDate()}
            autoCapitalize="none"
            error={errors.joiningDate}
          />
          <FormField
            label="Notes"
            value={form.notes}
            onChangeText={set('notes')}
            placeholder="Allergies, delivery instructions… (optional)"
            multiline
            error={errors.notes}
          />

          <PrimaryButton
            label={isEdit ? 'Save changes' : 'Add customer'}
            loading={saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
