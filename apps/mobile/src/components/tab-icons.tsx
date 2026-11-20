import React from 'react';
import { View, type ColorValue } from 'react-native';

/** Hand-drawn tab glyphs (no icon library in this template) — pure Views so they
 *  tint with the tab bar's active/inactive color. */

export function HomeGlyph({ color }: { color: ColorValue }) {
  return (
    <View style={{ width: 24, height: 22, alignItems: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 11,
          borderRightWidth: 11,
          borderBottomWidth: 9,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: 15,
          height: 10,
          marginTop: 1,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function OrdersGlyph({ color }: { color: ColorValue }) {
  return (
    <View
      style={{
        width: 21,
        height: 22,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: color,
        paddingHorizontal: 3,
        justifyContent: 'space-evenly',
      }}>
      <View style={{ height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ height: 2, borderRadius: 1, backgroundColor: color, width: '70%' }} />
    </View>
  );
}

export function CustomersGlyph({ color }: { color: ColorValue }) {
  return (
    <View style={{ width: 24, height: 22, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />
      <View
        style={{
          width: 18,
          height: 9,
          marginTop: 1,
          borderTopLeftRadius: 9,
          borderTopRightRadius: 9,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
    </View>
  );
}

export function MoreGlyph({ color }: { color: ColorValue }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 22, gap: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export function ExpensesGlyph({ color }: { color: ColorValue }) {
  // Open ledger: two pages meeting at a spine.
  return (
    <View style={{ width: 26, height: 22, flexDirection: 'row', justifyContent: 'center' }}>
      <View
        style={{
          width: 11,
          height: 18,
          borderWidth: 2,
          borderRightWidth: 1,
          borderColor: color,
          borderTopLeftRadius: 4,
          borderBottomLeftRadius: 4,
          paddingTop: 3,
          paddingLeft: 2,
        }}>
        <View style={{ height: 2, width: 5, borderRadius: 1, backgroundColor: color }} />
      </View>
      <View
        style={{
          width: 11,
          height: 18,
          borderWidth: 2,
          borderLeftWidth: 1,
          borderColor: color,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
          paddingTop: 3,
          paddingLeft: 2,
        }}>
        <View style={{ height: 2, width: 5, borderRadius: 1, backgroundColor: color }} />
      </View>
    </View>
  );
}
