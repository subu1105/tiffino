import { changePasswordSchema } from '@tiffino/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';

import { errorMessage } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ApiError, apiPost } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/providers/toast';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signOutLocally } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const fieldErrors: Record<string, string> = {};
      const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
      }
      if (newPassword !== confirm) {
        fieldErrors.confirm = 'Passwords do not match';
      }
      if (Object.keys(fieldErrors).length > 0 || !parsed.success) {
        setErrors(fieldErrors);
        throw new ApiError('VALIDATION_ERROR', 'Fix the highlighted fields.', 0);
      }
      setErrors({});
      return apiPost<{ message?: string }>('/auth/change-password', parsed.data);
    },
    onSuccess: async () => {
      // The server revoked every token, so the stored session is dead — drop it
      // and land on login deliberately instead of a surprise logout later.
      toast.show('Password changed. Sign in again with your new password.', 'success');
      await signOutLocally();
      router.replace('/login');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.status === 0) return;
      toast.show(errorMessage(err), 'error');
    },
  });

  return (
    <Screen title="Change password">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled">
          <Text className="mb-4 text-sm text-charcoal/60">
            New passwords need at least 8 characters with a letter and a number.
          </Text>
          <FormField
            label="Current password"
            value={currentPassword}
            onChangeText={(v) => {
              setCurrentPassword(v);
              if (errors.currentPassword) setErrors((e) => ({ ...e, currentPassword: '' }));
            }}
            secureTextEntry
            autoCapitalize="none"
            error={errors.currentPassword}
          />
          <FormField
            label="New password"
            value={newPassword}
            onChangeText={(v) => {
              setNewPassword(v);
              if (errors.newPassword) setErrors((e) => ({ ...e, newPassword: '' }));
            }}
            secureTextEntry
            autoCapitalize="none"
            error={errors.newPassword}
          />
          <FormField
            label="Confirm new password"
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              if (errors.confirm) setErrors((e) => ({ ...e, confirm: '' }));
            }}
            secureTextEntry
            autoCapitalize="none"
            error={errors.confirm}
          />
          <PrimaryButton
            label="Change password"
            loading={mutation.isPending}
            onPress={() => mutation.mutate()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
