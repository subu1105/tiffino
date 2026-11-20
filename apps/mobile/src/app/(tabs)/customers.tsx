import { formatINR, type CustomerDTO, type OrderStatus } from '@tiffino/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Chip, TypeTag } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingList } from '@/components/loading-list';
import { Screen } from '@/components/screen';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { fetchCustomers } from '@/lib/queries';
import { useCan } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type Filter = 'all' | 'regular' | 'occasional' | 'inactive';

function MealDot({ status }: { status: OrderStatus | null | undefined }) {
  const booked = status != null && status !== 'cancelled';
  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: booked ? '#2E9E5B' : 'transparent',
        borderWidth: booked ? 0 : 1.5,
        borderColor: '#2B2D2F55',
      }}
    />
  );
}

export default function CustomersScreen() {
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const [search, setSearch] = useState('');
  useRefreshOnFocus(['customers']);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const listParams = useMemo(
    () => ({
      q: q || undefined,
      type: filter === 'regular' || filter === 'occasional' ? filter : undefined,
      status: filter === 'inactive' ? 'inactive' : 'active',
    }),
    [q, filter],
  );

  const listQuery = useInfiniteQuery({
    queryKey: ['customers', 'list', listParams],
    queryFn: ({ pageParam }) =>
      fetchCustomers({ ...listParams, todayStatus: '1', page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });

  const customers = useMemo(
    () => (listQuery.data ? listQuery.data.pages.flatMap((p) => p.data) : []),
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.meta?.total;

  const renderItem = ({ item }: { item: CustomerDTO }) => (
    <Pressable
      onPress={() => router.push(`/customer/${item.id}`)}
      className="mx-4 mb-3 rounded-2xl bg-white p-4 active:bg-forest-50"
      style={{
        shadowColor: '#1b4332',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}>
      <View className="flex-row items-center justify-between">
        <Text className="mr-2 shrink text-base font-bold text-charcoal" numberOfLines={1}>
          {item.fullName}
        </Text>
        <TypeTag type={item.type} />
      </View>
      <Pressable
        hitSlop={10}
        onPress={() => {
          Linking.openURL(`tel:${item.mobile}`).catch(() =>
            toast.show('Could not open the dialer on this device.', 'error'),
          );
        }}
        accessibilityRole="button"
        accessibilityLabel={`Call ${item.mobile}`}
        className="mt-1 min-h-[32px] flex-row items-center self-start active:opacity-60">
        <Text className="text-sm font-semibold text-forest-600">📞 {item.mobile}</Text>
      </Pressable>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-sm text-charcoal/70">
          {item.breakfastPrice > 0 ? `B ${formatINR(item.breakfastPrice)} · ` : ''}L{' '}
          {formatINR(item.lunchPrice)} · D {formatINR(item.dinnerPrice)}
        </Text>
        {item.status === 'inactive' ? (
          <Text className="text-xs font-bold uppercase text-danger">Inactive</Text>
        ) : (
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text className="text-xs font-semibold text-charcoal/50">Today</Text>
            <Text className="text-xs font-bold text-charcoal/70">L</Text>
            <MealDot status={item.todayLunch} />
            <Text className="text-xs font-bold text-charcoal/70">D</Text>
            <MealDot status={item.todayDinner} />
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <View className="flex-row items-end justify-between px-4 pt-2">
        <Text className="text-xs font-extrabold tracking-[4px] text-forest-800">CUSTOMERS</Text>
        <Text className="text-xs font-semibold text-charcoal/50">
          {total != null ? `${total} ${filter === 'inactive' ? 'inactive' : 'active'}` : ' '}
        </Text>
      </View>

      <View className="mx-4 mt-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or mobile…"
          placeholderTextColor="#2B2D2F55"
          autoCapitalize="none"
          className="min-h-[48px] rounded-2xl bg-white px-4 py-2.5 text-base text-charcoal"
        />
      </View>

      <View className="mt-3 flex-row px-4" style={{ gap: 8 }}>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Regular" selected={filter === 'regular'} onPress={() => setFilter('regular')} />
        <Chip
          label="Occasional"
          selected={filter === 'occasional'}
          onPress={() => setFilter('occasional')}
        />
        <Chip label="Inactive" selected={filter === 'inactive'} onPress={() => setFilter('inactive')} />
      </View>

      {listQuery.isLoading ? (
        <View className="mt-4">
          <LoadingList rows={6} rowHeight={96} />
        </View>
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 96 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) listQuery.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
              onRefresh={() => {
                listQuery.refetch();
              }}
              tintColor="#1b4332"
            />
          }
          ListFooterComponent={
            listQuery.isFetchingNextPage ? (
              <ActivityIndicator className="my-4" color="#1b4332" />
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              title={q ? 'No customers match' : 'No customers yet'}
              message={q ? 'Try a different name or mobile.' : 'Tap + to add your first customer.'}
            />
          }
        />
      )}

      {can('customers.manage') ? (
        <Pressable
          onPress={() => router.push('/customer/new')}
          accessibilityRole="button"
          accessibilityLabel="Add customer"
          className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-2xl bg-flame-500 active:bg-flame-600"
          style={{
            shadowColor: '#8f440b',
            shadowOpacity: 0.35,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 5 },
            elevation: 6,
          }}>
          <Text className="text-3xl font-bold leading-9 text-white">+</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
