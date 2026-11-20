import { addDays, formatBusinessDate, todayBusinessDate } from '@tiffino/shared';
import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { CalendarSheet } from '@/components/calendar-sheet';
import { PrimaryButton } from '@/components/primary-button';

export interface PeriodPreset {
  label: string;
  /** Omit both for "all time". */
  from?: string;
  to?: string;
}

/** TIFFINO-themed bottom sheet for choosing a report period: quick presets
 *  plus a custom from/to range with the native date picker. */
export function PeriodSheet({
  visible,
  title,
  subtitle,
  presets = [],
  initialFrom,
  confirmLabel = 'Use these dates',
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Optional quick choices; omit for a pure date-range picker. */
  presets?: PeriodPreset[];
  initialFrom?: string;
  confirmLabel?: string;
  onPick: (label: string, from?: string, to?: string) => void;
  onClose: () => void;
}) {
  const today = todayBusinessDate();
  const [customFrom, setCustomFrom] = useState(initialFrom ?? addDays(today, -30));
  const [customTo, setCustomTo] = useState(today);
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null);

  const choose = (label: string, from?: string, to?: string) => {
    onClose();
    onPick(label, from, to);
  };

  const confirmCustom = () => {
    // Auto-correct a reversed range instead of nagging.
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    choose(`${formatBusinessDate(from)} – ${formatBusinessDate(to)}`, from, to);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-charcoal/50"
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
        <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
        <Text className="text-lg font-extrabold text-forest-800">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-charcoal/55">{subtitle}</Text> : null}

        <View className={presets.length > 0 ? 'mt-4' : ''} style={{ gap: 8 }}>
          {presets.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => choose(p.label, p.from, p.to)}
              accessibilityRole="button"
              className="min-h-[52px] flex-row items-center justify-between rounded-2xl bg-white px-4 active:bg-forest-50">
              <Text className="text-base font-bold text-charcoal">{p.label}</Text>
              <Text className="text-xs text-charcoal/45">
                {p.from && p.to
                  ? `${formatBusinessDate(p.from)} – ${formatBusinessDate(p.to)}`
                  : 'Full history'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-5 text-[11px] font-extrabold uppercase tracking-wider text-charcoal/50">
          {presets.length > 0 ? 'Custom dates' : 'Choose dates'}
        </Text>
        <View className="mt-2 flex-row" style={{ gap: 8 }}>
          {(
            [
              ['from', 'From', customFrom],
              ['to', 'To', customTo],
            ] as const
          ).map(([key, label, value]) => (
            <Pressable
              key={key}
              onPress={() => setPicking(key)}
              accessibilityRole="button"
              className={`min-h-[52px] flex-1 justify-center rounded-2xl bg-white px-4 ${picking === key ? 'border border-flame-500' : 'border border-transparent'}`}>
              <Text className="text-[10px] font-bold uppercase tracking-wider text-charcoal/45">
                {label}
              </Text>
              <Text className="mt-0.5 text-sm font-bold text-charcoal">
                {formatBusinessDate(value)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-3">
          <PrimaryButton label={confirmLabel} variant="flame" compact onPress={confirmCustom} />
        </View>

        <CalendarSheet
          visible={picking !== null}
          value={picking === 'from' ? customFrom : customTo}
          title={picking === 'from' ? 'From date' : 'To date'}
          onClose={() => setPicking(null)}
          onPick={(s) => {
            if (picking === 'from') setCustomFrom(s);
            else setCustomTo(s);
            setPicking(null);
          }}
        />
      </View>
    </Modal>
  );
}
