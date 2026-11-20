import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { useConfirmSheet } from '@/components/confirm-sheet';
import { errorMessage } from '@/components/error-state';
import { useAuth, useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

function MenuRow({
  label,
  caption,
  onPress,
  danger = false,
  first = false,
}: {
  label: string;
  caption?: string;
  onPress: () => void;
  danger?: boolean;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`min-h-[56px] flex-row items-center justify-between px-4 py-3.5 active:bg-cream ${first ? '' : 'border-t border-cream'}`}>
      <View className="mr-3 flex-1">
        <Text className={`text-base font-bold ${danger ? 'text-danger' : 'text-charcoal'}`}>{label}</Text>
        {caption ? <Text className="mt-0.5 text-xs text-charcoal/50">{caption}</Text> : null}
      </View>
      <Text className="text-lg text-charcoal/30">›</Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const can = useCan();
  const router = useRouter();
  const toast = useToast();
  const sheet = useConfirmSheet();

  const confirmLogout = () => {
    void (async () => {
      const ok = await sheet.confirm({
        title: 'Log out?',
        message: 'You will need your email and password to sign back in.',
        cancelLabel: 'Stay',
        confirmLabel: 'Log out',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await logout();
      } catch (err) {
        toast.show(errorMessage(err), 'error');
      }
    })();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 pt-2">
          <Text className="text-xs font-extrabold tracking-[4px] text-forest-800">MORE</Text>
        </View>

        {/* User card */}
        <View className="mx-4 mt-4 flex-row items-center rounded-2xl bg-forest-800 p-5">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-forest-600">
            <Text className="text-lg font-extrabold text-cream">
              {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="ml-4 flex-1">
            <Text className="text-base font-bold text-cream" numberOfLines={1}>
              {user?.fullName}
            </Text>
            <Text className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-forest-200">
              {user?.role === 'owner' ? 'Owner' : 'Staff'}
            </Text>
            <Text className="mt-0.5 text-xs text-forest-200" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        {/* Menu */}
        <View className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white">
          {can('payments.record') ? (
            <MenuRow
              first
              label="Record payment"
              caption="Log cash, UPI or bank transfer"
              onPress={() => router.push('/payment/new')}
            />
          ) : null}
          {can('payments.view') ? (
            <MenuRow
              first={!can('payments.record')}
              label="Statements"
              caption="Every statement sent, customer-wise — view or delete"
              onPress={() => router.push('/statements')}
            />
          ) : null}
          {can('expenses.view') ? (
            <MenuRow
              first={!can('payments.record') && !can('payments.view')}
              label="Profit & Loss"
              caption="Revenue vs expenses — day, week, month"
              onPress={() => router.push('/profit-loss')}
            />
          ) : null}
          {can('expenses.view') ? (
            <MenuRow
              first={false}
              label="Cook invoice"
              caption="Money given & returns — net total"
              onPress={() => router.push('/cook')}
            />
          ) : null}
          {can('expenses.view') ? (
            <MenuRow
              first={false}
              label="Cook attendance"
              caption="Worked, half days & leave — wages join P&L"
              onPress={() => router.push('/cook-attendance')}
            />
          ) : null}
          {can('reports.view') ? (
            <MenuRow
              first={!can('payments.record') && !can('payments.view') && !can('expenses.view')}
              label="Daily report"
              caption="Today's tiffins & revenue, view only"
              onPress={() => router.push('/reports/daily')}
            />
          ) : null}
          <MenuRow
            first={
              !can('payments.record') &&
              !can('payments.view') &&
              !can('reports.view') &&
              !can('expenses.view')
            }
            label="Change password"
            onPress={() => router.push('/settings/change-password')}
          />
        </View>

        {/* Web-only note */}
        <View className="mx-4 mt-4 rounded-2xl border border-forest-100 bg-white p-4">
          <Text className="text-sm font-bold text-charcoal">Looking for staff or CSV export?</Text>
          <Text className="mt-1 text-xs leading-5 text-charcoal/60">
            Staff management and CSV report export live in the TIFFINO web console — sign in there
            with the same account.
          </Text>
        </View>

        <View className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white">
          <MenuRow first danger label="Log out" onPress={confirmLogout} />
        </View>
      </ScrollView>
    </Screen>
  );
}
