import type { OrderStatus } from '@tiffino/shared';
import React from 'react';
import { Text, View } from 'react-native';

const STYLES: Record<OrderStatus, { dot: string; text: string; bg: string; label: string }> = {
  booked: { dot: '#1b4332', text: 'text-forest-800', bg: 'bg-forest-100', label: 'Booked' },
  prepared: { dot: '#E8930C', text: 'text-warning', bg: 'bg-flame-50', label: 'Prepared' },
  delivered: { dot: '#2E9E5B', text: 'text-success', bg: 'bg-forest-50', label: 'Delivered' },
  cancelled: { dot: '#E05B4C', text: 'text-danger', bg: 'bg-white', label: 'Cancelled' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STYLES[status];
  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${s.bg}`}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.dot, marginRight: 5 }} />
      <Text className={`text-xs font-bold ${s.text}`}>{s.label}</Text>
    </View>
  );
}
