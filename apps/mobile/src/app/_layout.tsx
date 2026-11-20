import '@/global.css';

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmSheetProvider } from '@/components/confirm-sheet';
import { AuthProvider, useAuth } from '@/providers/auth';
import { ToastProvider } from '@/providers/toast';

SplashScreen.preventAutoHideAsync();

// Coming back to the app (background → foreground) counts as "focus" so every
// visible screen refreshes its numbers.
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Every screen you navigate to makes a fresh API call — the cached data
      // shows instantly while the new numbers load in the background.
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0, // writes never auto-retry — a replayed booking could double-book
    },
  },
});

function RootNavigator() {
  const { status } = useAuth();
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && !splashHidden) {
      SplashScreen.hideAsync().catch(() => {});
      setSplashHidden(true);
    }
  }, [status, splashHidden]);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#1b4332" size="large" />
      </View>
    );
  }

  const authed = status === 'authenticated';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFF8F0' },
      }}>
      {/* Guards cover EVERY screen, so a deep link while logged out always
          lands on login instead of rendering a broken authed screen. */}
      <Stack.Protected guard={!authed}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={authed}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="customer/[id]" />
        <Stack.Screen name="customer/new" />
        <Stack.Screen name="payment/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reports/daily" />
        <Stack.Screen name="statements/index" />
        <Stack.Screen name="profit-loss/index" />
        <Stack.Screen name="cook/index" />
        <Stack.Screen name="cook-attendance/index" />
        <Stack.Screen name="settings/change-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmSheetProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </ConfirmSheetProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
