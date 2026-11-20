import React from 'react';
import { Pressable, Text } from 'react-native';

/** Small rounded label; tappable when `onPress` is given (filter chips). */
export function Chip({
  label,
  selected = false,
  onPress,
  tone = 'forest',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'forest' | 'flame' | 'neutral';
}) {
  const selectedCls =
    tone === 'flame' ? 'bg-flame-500 border-flame-500' : 'bg-forest-800 border-forest-800';
  const idleCls = 'bg-white border-forest-100';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      className={`min-h-[36px] items-center justify-center rounded-full border px-4 py-1.5 ${selected ? selectedCls : idleCls}`}>
      <Text className={`text-sm font-semibold ${selected ? 'text-cream' : 'text-charcoal/80'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Static customer-type tag: [REGULAR] / [OCCASIONAL]. */
export function TypeTag({ type }: { type: 'regular' | 'occasional' }) {
  return (
    <Text
      className={`overflow-hidden rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        type === 'regular' ? 'bg-forest-100 text-forest-800' : 'bg-flame-100 text-flame-800'
      }`}>
      {type}
    </Text>
  );
}

/** Did the customer pay after this statement was sent? */
export function SettlementTag({ status }: { status: 'settled' | 'partial' | 'awaiting' }) {
  const cls =
    status === 'settled'
      ? 'bg-forest-100 text-forest-800'
      : status === 'partial'
        ? 'bg-flame-100 text-flame-800'
        : 'bg-danger/10 text-danger';
  const label = status === 'settled' ? 'PAID ✓' : status === 'partial' ? 'PARTIAL' : 'NOT PAID';
  return (
    <Text
      className={`overflow-hidden rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </Text>
  );
}
