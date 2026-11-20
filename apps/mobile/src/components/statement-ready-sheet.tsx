import { formatINR } from '@tiffino/shared';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { shareCachedFile } from '@/lib/share-file';
import type { ReadyStatement } from '@/lib/statement-pdf';
import { useToast } from '@/providers/toast';

/** Review sheet for a built statement: preview the PDF first, send only when
 *  it looks right. The record itself is already saved server-side. */
export function StatementReadySheet({
  ready,
  onClose,
}: {
  ready: ReadyStatement | null;
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
        toast.show('Preview could not open on this device — tap SEND and open it in a PDF app instead.', 'info');
      }
    })();
  };

  const send = () => {
    void (async () => {
      if (!ready) return;
      const result = await shareCachedFile(ready.file, ready.mimeType, ready.summaryText);
      if (result === 'text') {
        toast.show('File sharing failed — shared the statement summary as text instead.', 'info');
      }
      onClose();
    })();
  };

  return (
    <Modal visible={ready !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-charcoal/50" onPress={onClose} accessibilityLabel="Close" />
      <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
        <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
        <Text className="text-lg font-extrabold text-forest-800">Statement ready ✓</Text>
        {ready ? (
          <>
            <Text className="mt-0.5 text-xs text-charcoal/55">
              {ready.record.customerName} · {ready.record.periodLabel}
            </Text>
            <View className="mt-3 rounded-2xl bg-white p-4">
              <Text className="text-sm font-bold text-charcoal">
                {ready.record.totalTiffins} tiffins (Lunch {ready.record.lunchCount} · Dinner{' '}
                {ready.record.dinnerCount})
              </Text>
              <Text className="mt-1 text-sm text-charcoal/70">
                Period amount: {formatINR(ready.record.periodAmount)}
              </Text>
              <Text className="mt-1 text-sm font-bold text-warning">
                Pending: {formatINR(ready.record.pending)}
              </Text>
            </View>
            <Text className="mt-2 text-[11px] text-charcoal/50">
              A record is saved in the payments section — reconcile it there when the payment
              arrives.
            </Text>
            <View className="mt-4" style={{ gap: 10 }}>
              <PrimaryButton label="👁  PREVIEW (OPEN PDF)" compact onPress={preview} />
              <PrimaryButton
                label="📤  SEND — WHATSAPP / SHARE"
                variant="flame"
                compact
                onPress={send}
              />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
