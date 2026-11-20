import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useAuth } from '@/providers/auth';

export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'authenticated') return <Redirect href="/(tabs)/home" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFF8F0' } }} />;
}
