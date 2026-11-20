import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '@/lib/api';

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View className="items-center px-8 py-14">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
        <Text className="text-xl font-extrabold text-danger">!</Text>
      </View>
      <Text className="mt-4 text-center text-base font-bold text-charcoal">Couldn't load this</Text>
      <Text className="mt-1 text-center text-sm text-charcoal/60">{errorMessage(error)}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="mt-5 min-h-[44px] items-center justify-center rounded-2xl bg-forest-800 px-6 active:bg-forest-900">
          <Text className="font-bold text-cream">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
