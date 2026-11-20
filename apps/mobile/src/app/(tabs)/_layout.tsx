import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import {
  CustomersGlyph,
  ExpensesGlyph,
  HomeGlyph,
  MoreGlyph,
  OrdersGlyph,
} from '@/components/tab-icons';
import { useAuth, useCan } from '@/providers/auth';

export default function TabsLayout() {
  const { status } = useAuth();
  const can = useCan();
  if (status !== 'authenticated') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1b4332',
        tabBarInactiveTintColor: '#9aa09b',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#f1e8dc',
          height: 86,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: '#FFF8F0' },
      }}>
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeGlyph color={color} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: ({ color }) => <OrdersGlyph color={color} /> }}
      />
      <Tabs.Screen
        name="customers"
        options={{ title: 'Customers', tabBarIcon: ({ color }) => <CustomersGlyph color={color} /> }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color }) => <ExpensesGlyph color={color} />,
          // Staff without expense access never see this tab.
          href: can('expenses.view') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ color }) => <MoreGlyph color={color} /> }}
      />
    </Tabs>
  );
}
