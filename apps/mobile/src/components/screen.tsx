import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Cream-canvas screen wrapper. With a `title` it renders a stack-style header
 *  (back chevron + title + optional right slot). */
export function Screen({
  children,
  title,
  subtitle,
  headerRight,
  edges = ['top'],
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const router = useRouter();
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-cream">
      {title ? (
        <View className="flex-row items-center px-4 pb-3 pt-2">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-10 w-10 items-center justify-center rounded-full bg-white">
            <Text className="text-xl font-semibold text-forest-800">‹</Text>
          </Pressable>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-charcoal" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text className="text-xs text-charcoal/60" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight}
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}
