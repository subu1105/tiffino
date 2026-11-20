import React, { useState } from 'react';
import { Pressable, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

/** Labeled white rounded input with inline validation error.
 *  Secure fields get an eye toggle to peek at the typed password. */
export function FormField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType,
  secureTextEntry,
  autoCapitalize = 'sentences',
  autoComplete,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'tel' | 'name' | 'off';
  multiline?: boolean;
}) {
  const isSecure = !!secureTextEntry;
  const [hidden, setHidden] = useState(true);

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-[13px] font-bold text-charcoal/70">{label}</Text>
      <View className="relative">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#2B2D2F55"
          keyboardType={keyboardType}
          secureTextEntry={isSecure && hidden}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          multiline={multiline}
          className={`rounded-2xl bg-white text-base text-charcoal ${multiline ? 'min-h-[88px] py-3' : 'min-h-[52px] py-3'} ${error ? 'border border-danger' : 'border border-transparent'} ${isSecure ? 'pl-4 pr-12' : 'px-4'}`}
          style={multiline ? { textAlignVertical: 'top' } : undefined}
        />
        {isSecure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            className="absolute bottom-0 right-3 top-0 justify-center">
            <Text style={{ fontSize: 18 }}>{hidden ? '👁️' : '🙈'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="mt-1 text-xs font-semibold text-danger">{error}</Text> : null}
    </View>
  );
}
