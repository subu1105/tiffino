import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-extrabold text-forest-800">Screen not found</Text>
        <Text className="mt-2 text-center text-sm text-charcoal/60">
          That link doesn't go anywhere in TIFFINO.
        </Text>
        <View className="mt-6 w-48">
          <PrimaryButton label="Go home" onPress={() => router.replace('/')} />
        </View>
      </View>
    </Screen>
  );
}
