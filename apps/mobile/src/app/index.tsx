import { Redirect } from 'expo-router';
import React from 'react';

import { useAuth } from '@/providers/auth';

export default function Index() {
  const { status } = useAuth();
  if (status === 'authenticated') return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/login" />;
}
