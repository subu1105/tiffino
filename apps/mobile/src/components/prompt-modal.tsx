import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

/** Cross-platform replacement for iOS-only Alert.prompt — used for the optional
 *  cancellation reason. */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (text: string) => void;
  onDismiss: () => void;
}) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-charcoal/50 px-6">
        <View className="w-full rounded-2xl bg-white p-5">
          <Text className="text-base font-bold text-charcoal">{title}</Text>
          {message ? <Text className="mt-1 text-sm text-charcoal/60">{message}</Text> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#2B2D2F55"
            className="mt-4 min-h-[48px] rounded-xl bg-cream px-4 py-2.5 text-base text-charcoal"
          />
          <View className="mt-5 flex-row justify-end gap-3">
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center rounded-xl px-4">
              <Text className="font-bold text-charcoal/60">Back</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(text.trim())}
              accessibilityRole="button"
              className={`min-h-[44px] items-center justify-center rounded-xl px-5 ${destructive ? 'bg-danger' : 'bg-forest-800'}`}>
              <Text className="font-bold text-white">{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
