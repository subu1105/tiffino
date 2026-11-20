import React from 'react';
import { Text, View } from 'react-native';

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View className="items-center px-8 py-14">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-forest-100">
        <View className="h-4 w-4 rounded-full border-2 border-forest-500" />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-charcoal">{title}</Text>
      {message ? <Text className="mt-1 text-center text-sm text-charcoal/60">{message}</Text> : null}
    </View>
  );
}
