import { changePasswordSchema } from '@tiffino/shared';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { isApiError } from '../../api/client';
import { changePassword, logoutAll } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { FormField } from '../../components/FormField';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

export function SettingsPage() {
  const { user, clearSession } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const changeMutation = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {};
      const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          if (key && !(key in next)) next[key] = issue.message;
        }
      }
      if (newPassword !== confirmPassword) {
        next.confirmPassword = 'Passwords do not match';
      }
      if (Object.keys(next).length > 0 || !parsed.success) {
        setErrors(next);
        throw new Error('validation');
      }
      return changePassword(parsed.data.currentPassword, parsed.data.newPassword);
    },
    onSuccess: () => {
      toast.success('Password changed', 'Sign in again with your new password.');
      clearSession();
      navigate('/login', { replace: true });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'UNAUTHORIZED') || isApiError(err, 'VALIDATION_ERROR')) {
        setErrors({ currentPassword: 'Current password is incorrect' });
      } else {
        toast.apiError(err, 'Could not change password');
      }
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => {
      toast.success('Logged out everywhere', 'All devices must sign in again.');
      clearSession();
      navigate('/login', { replace: true });
    },
    onError: (err) => toast.apiError(err, 'Could not log out everywhere'),
  });

  const handleLogoutAll = async () => {
    const { ok } = await confirm({
      title: 'Log out everywhere?',
      body: 'Every device signed in to this account — including this one — is signed out immediately.',
      tone: 'danger',
      confirmLabel: 'Log out everywhere',
    });
    if (ok) logoutAllMutation.mutate();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    changeMutation.mutate();
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle={`${user?.fullName} · ${user?.email}`} />

      <div className="grid max-w-3xl grid-cols-1 gap-5">
        {/* Change password */}
        <div className="card p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-charcoal">
            <KeyRound className="h-4 w-4 text-forest-600" /> Change password
          </h3>
          <p className="mt-1 text-sm text-charcoal/55">
            Changing your password signs you out on every device.
          </p>
          <form className="mt-5 max-w-sm space-y-4" onSubmit={submit} noValidate>
            <FormField label="Current password" error={errors.currentPassword}>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="input pr-11"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label="Toggle visibility"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-charcoal/40 hover:bg-forest-50"
                  onClick={() => setShowCurrent((v) => !v)}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>
            <FormField
              label="New password"
              error={errors.newPassword}
              hint="At least 8 characters with a letter and a number."
            >
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  className="input pr-11"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  aria-label="Toggle visibility"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-charcoal/40 hover:bg-forest-50"
                  onClick={() => setShowNew((v) => !v)}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>
            <FormField label="Confirm new password" error={errors.confirmPassword}>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <button type="submit" className="btn btn-primary" disabled={changeMutation.isPending}>
              {changeMutation.isPending && (
                <Spinner className="h-4 w-4 border-white/40 border-t-white" />
              )}
              Change password
            </button>
          </form>
        </div>

        {/* Logout everywhere */}
        <div className="card border-danger/20 p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-charcoal">
            <ShieldAlert className="h-4 w-4 text-danger" /> Sessions
          </h3>
          <p className="mt-1 text-sm text-charcoal/55">
            Lost a device, or shared your password? Sign out every session at once.
          </p>
          <button
            type="button"
            className="btn btn-danger mt-5"
            onClick={() => void handleLogoutAll()}
            disabled={logoutAllMutation.isPending}
          >
            {logoutAllMutation.isPending ? (
              <Spinner className="h-4 w-4 border-white/40 border-t-white" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Log out everywhere
          </button>
        </div>
      </div>
    </div>
  );
}
