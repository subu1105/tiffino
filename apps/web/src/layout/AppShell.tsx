import type { Permission } from '@tiffino/shared';
import { formatBusinessDate, todayBusinessDate } from '@tiffino/shared';
import {
  BarChart3,
  CalendarDays,
  CalendarCheck2,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptIndianRupee,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cls } from '../lib/cls';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm?: Permission;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/daily-orders', label: 'Daily Orders', icon: UtensilsCrossed, perm: 'orders.view' },
  { to: '/customers', label: 'Customers', icon: Users, perm: 'customers.view' },
  { to: '/payments', label: 'Payments', icon: Wallet, perm: 'payments.view' },
  { to: '/expenses', label: 'Expenses', icon: ReceiptIndianRupee, perm: 'expenses.view' },
  { to: '/cook', label: 'Cook Invoice', icon: ChefHat, perm: 'expenses.view' },
  { to: '/cook-attendance', label: 'Cook Attendance', icon: CalendarCheck2, perm: 'expenses.view' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  { to: '/staff', label: 'Staff', icon: UserCog, ownerOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const PAGE_TITLES: Array<[string, string]> = [
  ['/dashboard', 'Dashboard'],
  ['/daily-orders', 'Daily Orders'],
  ['/customers/', 'Customer Profile'],
  ['/customers', 'Customers'],
  ['/payments', 'Payments'],
  ['/expenses', 'Expenses'],
  ['/cook', 'Cook Invoice'],
  ['/cook-attendance', 'Cook Attendance'],
  ['/reports', 'Reports'],
  ['/staff', 'Staff'],
  ['/settings', 'Settings'],
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.ownerOnly) return user?.role === 'owner';
    if (item.perm) return can(item.perm);
    return true;
  });

  const pageTitle =
    PAGE_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ?? 'TIFFINO';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div
        className={cls(
          'flex items-center gap-2.5 px-5 pb-6 pt-6',
          collapsed && 'justify-center px-0',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flame-500 text-white shadow-sm">
          <ChefHat className="h-5 w-5" strokeWidth={2} />
        </span>
        {!collapsed && (
          <span className="font-display text-xl font-bold tracking-tight text-cream">TIFFINO</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cls(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-400',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-forest-700 text-white shadow-sm'
                    : 'text-forest-100/70 hover:bg-forest-800 hover:text-white',
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
              {!collapsed && item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-forest-800 p-3">
        <div className={cls('flex items-center gap-3 rounded-xl px-2 py-2', collapsed && 'justify-center px-0')}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-flame-400 to-flame-600 text-xs font-bold text-white">
            {user ? initials(user.fullName) : '?'}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-cream">{user?.fullName}</p>
              <p className="text-[11px] capitalize text-forest-200/60">{user?.role}</p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              title="Log out"
              aria-label="Log out"
              className="rounded-lg p-2 text-forest-200/60 transition-all hover:bg-forest-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-400"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          className={cls(
            'mt-1 hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-forest-200/50 transition-all hover:bg-forest-800 hover:text-white lg:flex',
            collapsed && 'justify-center px-0',
          )}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Desktop sidebar */}
      <aside
        className={cls(
          'sticky top-0 hidden h-screen shrink-0 bg-forest-900 transition-all lg:block',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-forest-950/50 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-forest-900 shadow-lift">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute right-3 top-5 rounded-lg p-1.5 text-forest-200/70 hover:bg-forest-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#f1e9dc] bg-cream/85 px-4 py-3.5 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className="rounded-lg p-2 text-charcoal/60 transition-all hover:bg-forest-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <h2 className="font-display text-lg font-semibold text-charcoal">{pageTitle}</h2>
          </div>
          <span className="chip border border-[#e7decf] bg-white py-1.5 text-charcoal/60 shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-forest-600" />
            {formatBusinessDate(todayBusinessDate())}
          </span>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
