import React from 'react';
import { Pressable, Text } from 'react-native';

/** Horizontal-scroll dashboard stat card. */
export function StatCard({
  label,
  value,
  caption,
  accent = false,
  onPress,
}: {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'summary'}
      className="mr-3 w-36 rounded-2xl bg-white p-4"
      style={{
        shadowColor: '#1b4332',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      }}>
      <Text className="text-[11px] font-bold uppercase tracking-wider text-charcoal/50">{label}</Text>
      <Text className={`mt-2 text-2xl font-extrabold ${accent ? 'text-flame-600' : 'text-forest-800'}`}>
        {value}
      </Text>
      {caption ? <Text className="mt-1 text-xs text-charcoal/50">{caption}</Text> : null}
    </Pressable>
  );
}
