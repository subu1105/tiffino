import type { Permission, UserDTO } from '@tiffino/shared';
import {
  DEFAULT_STAFF_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_LABELS,
  createStaffSchema,
  resetStaffPasswordSchema,
  updateUserSchema,
} from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Eye, EyeOff, KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { fieldErrorsFromDetails, isApiError } from '../../api/client';
import {
  createStaff,
  listUsers,
  resetUserPassword,
  setUserStatus,
  updateUser,
} from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { ActiveBadge } from '../../components/Chips';
import { useConfirm } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { FormField } from '../../components/FormField';
import { RowMenu } from '../../components/Menu';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';

function zodFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

function PermissionChecklist({
  value,
  onChange,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
}) {
  const toggle = (perm: Permission) => {
    onChange(value.includes(perm) ? value.filter((p) => p !== perm) : [...value, perm]);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label mb-0">Permissions ({value.length})</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-forest-700 hover:underline"
            onClick={() => onChange([...DEFAULT_STAFF_PERMISSIONS])}
          >
            Use defaults
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-charcoal/45 hover:underline"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PERMISSIONS.map((perm) => (
          <label
            key={perm}
            className={cls(
              'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-all',
              value.includes(perm)
                ? 'border-forest-500 bg-forest-50 font-semibold text-forest-800'
                : 'border-[#e7decf] bg-white text-charcoal/60 hover:border-forest-300',
            )}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-forest-700"
              checked={value.includes(perm)}
              onChange={() => toggle(perm)}
            />
            {PERMISSION_LABELS[perm]}
          </label>
        ))}
      </div>
    </div>
  );
}

export function StaffPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const [resetting, setResetting] = useState<UserDTO | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  const statusMutation = useMutation({
    mutationFn: (vars: { user: UserDTO; status: 'active' | 'inactive' }) =>
      setUserStatus(vars.user.id, vars.status),
    onSuccess: (_u, vars) => {
      toast.success(
        vars.status === 'inactive'
          ? `${vars.user.fullName} deactivated`
          : `${vars.user.fullName} reactivated`,
      );
      invalidate();
    },
    onError: (err) => toast.apiError(err, 'Could not change status'),
  });

  const handleToggleStatus = async (u: UserDTO) => {
    const deactivating = u.status === 'active';
    const { ok } = await confirm({
      title: deactivating ? `Deactivate ${u.fullName}?` : `Reactivate ${u.fullName}?`,
      body: deactivating
        ? 'They are signed out everywhere and cannot log in until reactivated.'
        : 'They can sign in again with their existing password.',
      tone: deactivating ? 'danger' : 'primary',
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
    });
    if (ok) statusMutation.mutate({ user: u, status: deactivating ? 'inactive' : 'active' });
  };

  const users = query.data ?? [];

  const columns: Column<UserDTO>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div>
          <span className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            {u.fullName}
            {u.role === 'owner' && <Crown className="h-3.5 w-3.5 text-flame-500" />}
            {u.id === me?.id && <span className="chip bg-forest-50 text-forest-700">you</span>}
          </span>
          <span className="block text-[11px] text-charcoal/45">{u.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <span
          className={cls(
            'chip capitalize',
            u.role === 'owner' ? 'bg-flame-50 text-flame-700' : 'bg-forest-50 text-forest-700',
          )}
        >
          {u.role}
        </span>
      ),
    },
    {
      key: 'perms',
      header: 'Permissions',
      render: (u) =>
        u.role === 'owner' ? (
          <span className="text-sm text-charcoal/60">All permissions</span>
        ) : (
          <span className="tnum text-sm text-charcoal/70">
            {u.permissions.length} of {PERMISSIONS.length}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <ActiveBadge active={u.status === 'active'} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (u) =>
        u.role === 'owner' ? null : (
          <RowMenu
            items={[
              { label: 'Edit permissions…', icon: Pencil, onSelect: () => setEditing(u) },
              { label: 'Reset password…', icon: KeyRound, onSelect: () => setResetting(u) },
              {
                label: u.status === 'active' ? 'Deactivate…' : 'Reactivate…',
                icon: u.status === 'active' ? UserX : UserCheck,
                tone: u.status === 'active' ? 'danger' : 'default',
                onSelect: () => void handleToggleStatus(u),
              },
            ]}
          />
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Accounts and permissions for your kitchen team"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add Staff
          </button>
        }
      />

      {query.isError ? (
        <div className="card">
          <ErrorState onRetry={() => query.refetch()} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={users}
          rowKey={(u) => u.id}
          loading={query.isPending}
          empty={
            <EmptyState
              variant="food"
              title="No staff yet"
              message="Add kitchen or delivery staff and pick exactly what they can do."
              action={
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> Add Staff
                </button>
              }
            />
          }
          renderCard={(u) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                  {u.fullName}
                  {u.role === 'owner' && <Crown className="h-3.5 w-3.5 text-flame-500" />}
                </p>
                <p className="text-[11px] text-charcoal/45">{u.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <ActiveBadge active={u.status === 'active'} />
                  <span className="text-xs text-charcoal/50">
                    {u.role === 'owner'
                      ? 'All permissions'
                      : `${u.permissions.length} of ${PERMISSIONS.length} permissions`}
                  </span>
                </div>
              </div>
              {u.role !== 'owner' && (
                <RowMenu
                  items={[
                    { label: 'Edit permissions…', icon: Pencil, onSelect: () => setEditing(u) },
                    { label: 'Reset password…', icon: KeyRound, onSelect: () => setResetting(u) },
                    {
                      label: u.status === 'active' ? 'Deactivate…' : 'Reactivate…',
                      icon: u.status === 'active' ? UserX : UserCheck,
                      tone: u.status === 'active' ? 'danger' : 'default',
                      onSelect: () => void handleToggleStatus(u),
                    },
                  ]}
                />
              )}
            </div>
          )}
        />
      )}

      {adding && <AddStaffModal onClose={() => setAdding(false)} onSaved={invalidate} />}
      {editing && (
        <EditStaffModal user={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AddStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([...DEFAULT_STAFF_PERMISSIONS]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = createStaffSchema.safeParse({
        fullName: fullName.trim(),
        email,
        password,
        permissions,
      });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error.issues));
        throw new Error('validation');
      }
      return createStaff(parsed.data);
    },
    onSuccess: (u) => {
      toast.success(`${u.fullName} added`, 'They can sign in with the password you set.');
      onSaved();
      onClose();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'VALIDATION_ERROR')) {
        setErrors(fieldErrorsFromDetails(err.details));
      } else if (isApiError(err, 'DUPLICATE_RESOURCE')) {
        setErrors({ email: 'A user with this email already exists' });
      } else {
        toast.apiError(err, 'Could not add staff');
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    mutation.mutate();
  };

  return (
    <Modal
      title="Add Staff"
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-staff-form" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
            Create account
          </button>
        </>
      }
    >
      <form id="add-staff-form" className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Full name *" error={errors.fullName}>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label="Email *" error={errors.email}>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@kitchen.in"
            />
          </FormField>
        </div>
        <FormField
          label="Password *"
          error={errors.password}
          hint="At least 8 characters with a letter and a number."
        >
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-charcoal/40 hover:bg-forest-50"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>
        <PermissionChecklist value={permissions} onChange={setPermissions} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function EditStaffModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState(user.fullName);
  const [permissions, setPermissions] = useState<Permission[]>([...user.permissions]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = updateUserSchema.safeParse({ fullName: fullName.trim(), permissions });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error.issues));
        throw new Error('validation');
      }
      return updateUser(user.id, parsed.data);
    },
    onSuccess: () => {
      toast.success('Staff updated', 'New permissions apply on their next request.');
      onSaved();
      onClose();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      toast.apiError(err, 'Could not update staff');
    },
  });

  return (
    <Modal
      title={`Edit ${user.fullName}`}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={mutation.isPending}
            onClick={() => {
              setErrors({});
              mutation.mutate();
            }}
          >
            {mutation.isPending && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
            Save changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Full name" error={errors.fullName}>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </FormField>
        <PermissionChecklist value={permissions} onChange={setPermissions} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function ResetPasswordModal({ user, onClose }: { user: UserDTO; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = resetStaffPasswordSchema.safeParse({ newPassword: password });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Invalid password');
        throw new Error('validation');
      }
      return resetUserPassword(user.id, parsed.data.newPassword);
    },
    onSuccess: () => {
      toast.success('Password reset', `${user.fullName} must use the new password from now on.`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      toast.apiError(err, 'Could not reset password');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Modal
      title={`Reset password — ${user.fullName}`}
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="reset-password-form" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
            Reset password
          </button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={submit} noValidate>
        <FormField
          label="New password"
          error={error ?? undefined}
          hint="At least 8 characters with a letter and a number. Their old sessions are signed out."
        >
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className="input pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
            <button
              type="button"
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-charcoal/40 hover:bg-forest-50"
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>
      </form>
    </Modal>
  );
}
