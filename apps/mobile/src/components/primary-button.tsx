import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

type Variant = 'forest' | 'flame' | 'danger' | 'outline';

const CONTAINER: Record<Variant, string> = {
  forest: 'bg-forest-800 active:bg-forest-900',
  flame: 'bg-flame-500 active:bg-flame-600',
  danger: 'bg-danger active:opacity-90',
  outline: 'bg-white border border-forest-200 active:bg-forest-50',
};

const LABEL: Record<Variant, string> = {
  forest: 'text-cream',
  flame: 'text-white',
  danger: 'text-white',
  outline: 'text-forest-800',
};

export function PrimaryButton({
  label,
  onPress,
  onLongPress,
  variant = 'forest',
  loading = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={isDisabled}
      className={`w-full flex-row items-center justify-center rounded-2xl ${compact ? 'min-h-[44px] px-4' : 'min-h-[52px] px-5'} ${CONTAINER[variant]} ${isDisabled ? 'opacity-50' : ''}`}>
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? '#1b4332' : '#FFF8F0'} />
      ) : (
        <Text className={`text-base font-bold tracking-wide ${LABEL[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}
