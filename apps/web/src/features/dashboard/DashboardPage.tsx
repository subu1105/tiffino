import type { DashboardFilter } from '@tiffino/shared';
import {
  DASHBOARD_FILTERS,
  formatBusinessDate,
  formatINR,
  rangeForFilter,
  todayBusinessDate,
} from '@tiffino/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  Coffee,
  IndianRupee,
  Moon,
  Repeat,
  Sparkles,
  Sun,
  UsersRound,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDashboardRevenue, getDashboardSummary, getOrderStatistics } from '../../api/endpoints';
import { ErrorState } from '../../components/EmptyState';
import { MealChip, StatusBadge, TypeChip } from '../../components/Chips';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton, StatCardSkeleton } from '../../components/Spinner';
import { StatCard } from '../../components/StatCard';
import { cls } from '../../lib/cls';

// Palette-validated chart series (lunch = brand-forest step, dinner = flame).
const LUNCH_COLOR = '#27855c';
const DINNER_COLOR = '#f77f00';

const FILTER_LABELS: Record<DashboardFilter, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'Week',
  'this-month': 'Month',
};

type Selection = { kind: 'filter'; filter: DashboardFilter } | { kind: 'custom'; date: string };

function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function DashboardPage() {
  const today = todayBusinessDate();
  const [selection, setSelection] = useState<Selection>({ kind: 'filter', filter: 'today' });

  const range = useMemo(
    () =>
      selection.kind === 'custom'
        ? { from: selection.date, to: selection.date }
        : rangeForFilter(selection.filter),
    [selection],
  );
  const summaryDate = range.to;
  const isToday = summaryDate === today;

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary', summaryDate],
    queryFn: () => getDashboardSummary(summaryDate),
  });
  const revenueQuery = useQuery({
    queryKey: ['dashboard', 'revenue', range.from, range.to],
    queryFn: () => getDashboardRevenue(range.from, range.to),
  });
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', range.from, range.to],
    queryFn: () => getOrderStatistics(range.from, range.to),
  });

  const summary = summaryQuery.data;
  const revenue = revenueQuery.data;
  const points = statsQuery.data?.points ?? [];
  const chartData = points.map((p) => ({ ...p, label: shortDay(p.date) }));

  const mealLabel = (meal: string) => (isToday ? `Today's ${meal}` : `${meal} Orders`);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          range.from === range.to
            ? formatBusinessDate(range.to)
            : `${formatBusinessDate(range.from)} — ${formatBusinessDate(range.to)}`
        }
        actions={
          <>
            <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-[#e7decf] bg-white p-1 shadow-sm">
              {DASHBOARD_FILTERS.map((f) => {
                const active = selection.kind === 'filter' && selection.filter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    className={cls(
                      'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
                      active
                        ? 'bg-forest-800 text-white shadow-sm'
                        : 'text-charcoal/55 hover:bg-forest-50 hover:text-forest-800',
                    )}
                    onClick={() => setSelection({ kind: 'filter', filter: f })}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              aria-label="Custom date"
              className={cls(
                'input w-auto py-1.5 text-xs font-semibold',
                selection.kind === 'custom' && 'border-forest-500 ring-2 ring-forest-500/40',
              )}
              value={selection.kind === 'custom' ? selection.date : ''}
              max={today}
              onChange={(e) => {
                if (e.target.value) setSelection({ kind: 'custom', date: e.target.value });
              }}
            />
          </>
        }
      />

      {summaryQuery.isError ? (
        <div className="card">
          <ErrorState onRetry={() => summaryQuery.refetch()} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryQuery.isPending ? (
              Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : summary ? (
              <>
                <StatCard
                  icon={UsersRound}
                  label="Active Customers"
                  value={summary.activeCustomers}
                  to="/customers"
                />
                <StatCard
                  icon={Coffee}
                  label={mealLabel('Breakfast')}
                  value={summary.breakfastOrders}
                  to="/daily-orders?meal=breakfast"
                />
                <StatCard
                  icon={Sun}
                  label={mealLabel('Lunch')}
                  value={summary.lunchOrders}
                  to="/daily-orders?meal=lunch"
                />
                <StatCard
                  icon={Moon}
                  label={mealLabel('Dinner')}
                  value={summary.dinnerOrders}
                  variant="flame"
                  to="/daily-orders?meal=dinner"
                />
                <StatCard
                  icon={IndianRupee}
                  label="Expected Revenue"
                  value={formatINR(summary.expectedRevenue)}
                  sub={formatBusinessDate(summaryDate)}
                />
                <StatCard icon={Repeat} label="Regular" value={summary.regularCustomers} />
                <StatCard icon={Sparkles} label="Occasional" value={summary.occasionalCustomers} />
                <StatCard
                  icon={UtensilsCrossed}
                  label="Total Orders"
                  value={summary.totalOrders}
                  to="/daily-orders"
                />
                <StatCard
                  icon={Wallet}
                  label="Pending Payments"
                  value={formatINR(summary.pendingPayments)}
                  variant={summary.pendingPayments > 0 ? 'warning' : 'default'}
                  sub="All time"
                  to="/payments"
                />
              </>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Lunch vs Dinner chart */}
            <div className="card p-5 xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-charcoal">
                  Lunch vs Dinner
                </h3>
                <div className="flex items-center gap-2">
                  <MealChip meal="lunch" />
                  <MealChip meal="dinner" />
                </div>
              </div>
              {statsQuery.isPending ? (
                <Skeleton className="h-64 w-full" />
              ) : statsQuery.isError ? (
                <ErrorState onRetry={() => statsQuery.refetch()} />
              ) : chartData.length === 0 ? (
                <p className="py-16 text-center text-sm text-charcoal/50">
                  No orders in this range yet.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
                      <CartesianGrid vertical={false} stroke="#f1e9dc" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={{ stroke: '#e7decf' }}
                        tick={{ fontSize: 11, fill: '#6e6a63' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        width={32}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#6e6a63' }}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(27,67,50,0.05)' }}
                        formatter={(value: number, name: string, item) => {
                          const p = item?.payload as (typeof chartData)[number] | undefined;
                          const rev = name === 'Lunch' ? p?.lunchRevenue : p?.dinnerRevenue;
                          return [`${value} tiffins · ${formatINR(rev ?? 0)}`, name];
                        }}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #efe7db',
                          boxShadow: '0 6px 20px rgba(27,67,50,0.1)',
                          fontSize: 12,
                        }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12, color: '#6e6a63' }}
                      />
                      <Bar dataKey="lunch" name="Lunch" fill={LUNCH_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="dinner" name="Dinner" fill={DINNER_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Revenue summary */}
            <div className="card p-5">
              <h3 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-charcoal">
                <CalendarClock className="h-4 w-4 text-forest-600" />
                Revenue Summary
              </h3>
              {revenueQuery.isPending ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : revenueQuery.isError ? (
                <ErrorState onRetry={() => revenueQuery.refetch()} />
              ) : revenue ? (
                <dl className="space-y-1">
                  {[
                    {
                      label: `Breakfast (${revenue.breakfastOrders})`,
                      value: revenue.breakfastRevenue,
                    },
                    { label: `Lunch (${revenue.lunchOrders})`, value: revenue.lunchRevenue },
                    { label: `Dinner (${revenue.dinnerOrders})`, value: revenue.dinnerRevenue },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-cream/70"
                    >
                      <dt className="text-sm text-charcoal/60">{row.label}</dt>
                      <dd className="tnum text-sm font-semibold text-charcoal">
                        {formatINR(row.value)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl bg-forest-50 px-3 py-3">
                    <dt className="text-sm font-semibold text-forest-800">Expected total</dt>
                    <dd className="tnum font-display text-lg font-bold text-forest-800">
                      {formatINR(revenue.totalRevenue)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
                    <dt className="text-sm text-charcoal/60">Collected in range</dt>
                    <dd className="tnum text-sm font-semibold text-success">
                      {formatINR(revenue.collected)}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </div>

          {/* Recent lists */}
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-charcoal">
                  Recent Bookings
                </h3>
                <Link
                  to="/daily-orders"
                  className="text-xs font-semibold text-forest-700 hover:underline"
                >
                  View all →
                </Link>
              </div>
              {summary && summary.recentBookings.length === 0 ? (
                <p className="py-8 text-center text-sm text-charcoal/50">
                  No bookings yet — head to Daily Orders to start the day.
                </p>
              ) : (
                <ul className="divide-y divide-[#f6f0e6]">
                  {(summary?.recentBookings ?? []).slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-charcoal">
                          {o.customerName}
                        </p>
                        <p className="text-[11px] text-charcoal/45">
                          {formatBusinessDate(o.orderDate)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <MealChip meal={o.mealType} />
                        <span className="tnum text-sm font-semibold text-charcoal">
                          {formatINR(o.price)}
                        </span>
                        <StatusBadge status={o.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-charcoal">
                  Recent Customers
                </h3>
                <Link
                  to="/customers"
                  className="text-xs font-semibold text-forest-700 hover:underline"
                >
                  View all →
                </Link>
              </div>
              {summary && summary.recentCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-charcoal/50">
                  No customers yet — add your first one from the Customers page.
                </p>
              ) : (
                <ul className="divide-y divide-[#f6f0e6]">
                  {(summary?.recentCustomers ?? []).slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link
                        to={`/customers/${c.id}`}
                        className="min-w-0 truncate text-sm font-semibold text-charcoal hover:text-forest-700"
                      >
                        {c.fullName}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <TypeChip type={c.type} />
                        <span className="text-[11px] text-charcoal/45">
                          joined {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
