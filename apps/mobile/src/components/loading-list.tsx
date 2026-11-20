import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

/** Pulsing skeleton rows shown while a list query loads. */
export function LoadingList({ rows = 5, rowHeight = 76 }: { rows?: number; rowHeight?: number }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View className="px-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View
          key={i}
          style={{ opacity: pulse, height: rowHeight }}
          className="mb-3 rounded-2xl bg-white">
          <View className="m-4 h-3.5 w-1/2 rounded-full bg-forest-50" />
          <View className="mx-4 h-3 w-1/3 rounded-full bg-forest-50" />
        </Animated.View>
      ))}
    </View>
  );
}
