import type { Permission } from '@tiffino/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { FullPageSpinner } from '../components/Spinner';
import { useAuth, useCan } from './AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  // No cached user yet: wait for the silent refresh before deciding.
  if (!user && booting) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

/** Renders a friendly 403 instead of the page when the permission is missing. */
export function RequirePerm({ perm, children }: { perm: Permission; children: ReactNode }) {
  const allowed = useCan(perm);
  if (!allowed) {
    return (
      <EmptyState
        variant="locked"
        title="You don't have access to this"
        message="Ask the owner to grant you this permission from the Staff page."
      />
    );
  }
  return <>{children}</>;
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'owner') {
    return (
      <EmptyState
        variant="locked"
        title="Owner only"
        message="Only the business owner can manage staff accounts."
      />
    );
  }
  return <>{children}</>;
}
