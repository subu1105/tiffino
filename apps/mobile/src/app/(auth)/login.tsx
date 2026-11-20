import { forgotPasswordSchema, loginSchema } from '@tiffino/shared';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { errorMessage } from '@/components/error-state';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/providers/auth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const forgotPassword = async () => {
    setBanner(null);
    setInfo(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors({ email: 'Enter your email first, then tap Forgot password' });
      return;
    }
    try {
      const result = await apiPost<{ message: string }>('/auth/forgot-password', parsed.data);
      setInfo(result.message);
    } catch (err) {
      setBanner(errorMessage(err));
    }
  };

  const submit = async () => {
    Keyboard.dismiss();
    setBanner(null);
    setInfo(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'email' && !errs.email) errs.email = issue.message;
        if (key === 'password' && !errs.password) errs.password = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      // (auth)/_layout redirects to the tabs once status flips.
    } catch (err) {
      setBanner(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled">
          <View className="items-center">
            <Text className="text-4xl font-extrabold tracking-[6px] text-forest-800">TIFFINO</Text>
            <Text className="mt-2 text-sm font-semibold text-flame-600">
              Smart Tiffin &amp; Cloud Kitchen
            </Text>
          </View>

          <View className="mt-12">
            {banner ? (
              <View className="mb-4 rounded-2xl border border-danger/40 bg-white p-3.5">
                <Text className="text-sm font-semibold text-danger">{banner}</Text>
              </View>
            ) : null}
            {info ? (
              <View className="mb-4 rounded-2xl border border-forest-200 bg-white p-3.5">
                <Text className="text-sm font-semibold text-forest-700">{info}</Text>
              </View>
            ) : null}

            <FormField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={fieldErrors.email}
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
              }}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              error={fieldErrors.password}
            />

            <View className="mt-2">
              <PrimaryButton label="Sign in" onPress={submit} loading={submitting} />
            </View>

            <Pressable className="mt-6 items-center" hitSlop={8} onPress={forgotPassword}>
              <Text className="text-sm font-semibold text-forest-600">Forgot password?</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
