import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppApiError } from './api/client';
import { ProtectedRoute, RequireOwner, RequirePerm } from './auth/ProtectedRoute';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { EmptyState } from './components/EmptyState';
import { ToastProvider } from './components/Toast';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { CustomerProfilePage } from './features/customers/CustomerProfilePage';
import { CustomersPage } from './features/customers/CustomersPage';
import { DailyOrdersPage } from './features/dailyOrders/DailyOrdersPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { CookAttendancePage } from './features/cook/CookAttendancePage';
import { CookPage } from './features/cook/CookPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { StaffPage } from './features/staff/StaffPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Retry transient network blips once; never retry API-level errors.
        if (error instanceof AppApiError && error.code !== 'NETWORK_ERROR') return false;
        return failureCount < 1;
      },
    },
  },
});

/** Lands each user on the best page they can actually see. */
function HomeRedirect() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <Navigate to="/dashboard" replace />;
  if (can('orders.view')) return <Navigate to="/daily-orders" replace />;
  if (can('customers.view')) return <Navigate to="/customers" replace />;
  if (can('payments.view')) return <Navigate to="/payments" replace />;
  return <Navigate to="/settings" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<HomeRedirect />} />
                  <Route
                    path="/dashboard"
                    element={
                      <RequirePerm perm="dashboard.view">
                        <DashboardPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/daily-orders"
                    element={
                      <RequirePerm perm="orders.view">
                        <DailyOrdersPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/customers"
                    element={
                      <RequirePerm perm="customers.view">
                        <CustomersPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/customers/:id"
                    element={
                      <RequirePerm perm="customers.view">
                        <CustomerProfilePage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/payments"
                    element={
                      <RequirePerm perm="payments.view">
                        <PaymentsPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/expenses"
                    element={
                      <RequirePerm perm="expenses.view">
                        <ExpensesPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/cook"
                    element={
                      <RequirePerm perm="expenses.view">
                        <CookPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/cook-attendance"
                    element={
                      <RequirePerm perm="expenses.view">
                        <CookAttendancePage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <RequirePerm perm="reports.view">
                        <ReportsPage />
                      </RequirePerm>
                    }
                  />
                  <Route
                    path="/staff"
                    element={
                      <RequireOwner>
                        <StaffPage />
                      </RequireOwner>
                    }
                  />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route
                    path="*"
                    element={
                      <EmptyState
                        variant="search"
                        title="Page not found"
                        message="This page is off the menu. Pick a section from the sidebar."
                      />
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          </ConfirmProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
