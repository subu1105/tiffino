import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { shareCachedFile } from '@/lib/share-file';
import type { ReadyFile } from '@/lib/statement-pdf';
import { useToast } from '@/providers/toast';

/** Review sheet for any built PDF: preview it first, send only when it looks
 *  right — same flow as customer statements. */
export function PdfReadySheet({
  ready,
  title,
  subtitle,
  lines,
  onClose,
}: {
  ready: ReadyFile | null;
  title: string;
  subtitle?: string;
  lines?: string[];
  onClose: () => void;
}) {
  const toast = useToast();

  const preview = () => {
    void (async () => {
      if (!ready) return;
      try {
        await ready.file.preview();
      } catch (err) {
        console.warn('[tiffino] preview failed:', err);
        toast.show(
          'Preview could not open on this device — tap SEND and open it in a PDF app instead.',
          'info',
        );
      }
    })();
  };

  const send = () => {
    void (async () => {
      if (!ready) return;
      const result = await shareCachedFile(ready.file, ready.mimeType, ready.summaryText);
      if (result === 'text') {
        toast.show('File sharing failed — shared the summary as text instead.', 'info');
      }
      onClose();
    })();
  };

  return (
    <Modal visible={ready !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-charcoal/50" onPress={onClose} accessibilityLabel="Close" />
      <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
        <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
        <Text className="text-lg font-extrabold text-forest-800">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-charcoal/55">{subtitle}</Text> : null}
        {lines && lines.length > 0 ? (
          <View className="mt-3 rounded-2xl bg-white p-4">
            {lines.map((line, idx) => (
              <Text
                key={line}
                className={`text-sm text-charcoal ${idx === 0 ? 'font-bold' : 'mt-1 text-charcoal/70'}`}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <View className="mt-4" style={{ gap: 10 }}>
          <PrimaryButton label="👁  PREVIEW (OPEN PDF)" compact onPress={preview} />
          <PrimaryButton label="📤  SEND — WHATSAPP / SHARE" variant="flame" compact onPress={send} />
        </View>
      </View>
    </Modal>
  );
}
