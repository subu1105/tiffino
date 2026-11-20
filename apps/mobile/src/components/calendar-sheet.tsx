import { formatBusinessDate, todayBusinessDate } from '@tiffino/shared';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseYM(date: string): { year: number; month: number } {
  const [y, m] = date.split('-').map(Number);
  return { year: y, month: m };
}

/** TIFFINO-themed date picker: a bottom-sheet month calendar used everywhere
 *  instead of the system picker, so colors match the app. Tap a day to pick. */
export function CalendarSheet({
  visible,
  value,
  title = 'Pick a date',
  onPick,
  onClose,
}: {
  visible: boolean;
  /** Currently selected 'YYYY-MM-DD' — the calendar opens on its month. */
  value: string;
  title?: string;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const today = todayBusinessDate();
  const [cursor, setCursor] = useState(() => parseYM(value || today));

  // Re-center on the selected month every time the sheet opens.
  useEffect(() => {
    if (visible) setCursor(parseYM(value || today));
  }, [visible, value, today]);

  const shiftMonth = (delta: 1 | -1) =>
    setCursor((c) => {
      const m = c.month + delta;
      if (m < 1) return { year: c.year - 1, month: 12 };
      if (m > 12) return { year: c.year + 1, month: 1 };
      return { year: c.year, month: m };
    });

  // Calendar shape only — numeric y/m/d construction never shifts the date.
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null as null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const dateStr = (day: number) =>
    `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-charcoal/50" onPress={onClose} accessibilityLabel="Close" />
      <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
        <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />
        <Text className="text-lg font-extrabold text-forest-800">{title}</Text>
        <Text className="mt-0.5 text-xs text-charcoal/55">{formatBusinessDate(value)}</Text>

        {/* Month switcher */}
        <View className="mt-3 flex-row items-center justify-between">
          <Pressable
            onPress={() => shiftMonth(-1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="h-10 w-10 items-center justify-center rounded-xl bg-white active:bg-forest-50">
            <Text className="text-base font-extrabold text-forest-800">‹</Text>
          </Pressable>
          <Text className="text-base font-extrabold text-charcoal">
            {MONTHS[cursor.month - 1]} {cursor.year}
          </Text>
          <Pressable
            onPress={() => shiftMonth(1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className="h-10 w-10 items-center justify-center rounded-xl bg-white active:bg-forest-50">
            <Text className="text-base font-extrabold text-forest-800">›</Text>
          </Pressable>
        </View>

        {/* Weekday header */}
        <View className="mt-3 flex-row">
          {WEEKDAYS.map((w, i) => (
            <View key={`${w}${i}`} style={{ width: '14.2857%' }} className="items-center">
              <Text className="text-[10px] font-extrabold uppercase tracking-wider text-charcoal/40">
                {w}
              </Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        <View className="mt-1 flex-row flex-wrap">
          {cells.map((day, idx) => {
            if (day === null) return <View key={`blank-${idx}`} style={{ width: '14.2857%', height: 44 }} />;
            const ds = dateStr(day);
            const isSelected = ds === value;
            const isToday = ds === today;
            return (
              <View key={ds} style={{ width: '14.2857%', height: 44 }} className="items-center justify-center">
                <Pressable
                  onPress={() => onPick(ds)}
                  accessibilityRole="button"
                  accessibilityLabel={formatBusinessDate(ds)}
                  className={`h-9 w-9 items-center justify-center rounded-full ${
                    isSelected
                      ? 'bg-forest-800'
                      : isToday
                        ? 'border border-flame-500 bg-flame-500/10'
                        : 'active:bg-forest-50'
                  }`}>
                  <Text
                    className={`text-sm font-bold ${
                      isSelected ? 'text-cream' : isToday ? 'text-flame-600' : 'text-charcoal'
                    }`}>
                    {day}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => onPick(today)}
          accessibilityRole="button"
          className="mt-3 min-h-[44px] items-center justify-center rounded-2xl bg-white active:bg-forest-50">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-forest-800">
            Jump to today
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
