import type { CustomerType, MealType, OrderStatus } from '@tiffino/shared';
import { addDays, formatBusinessDate, formatINR, todayBusinessDate } from '@tiffino/shared';
import { useQuery } from '@tanstack/react-query';
import { Coffee, Download, IndianRupee, Moon, Sun, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  exportCustomerSummaryCsv,
  exportReportCsv,
  getDailyReport,
  getRevenueReport,
} from '../../api/endpoints';
import { MealChip, StatusBadge, TypeChip } from '../../components/Chips';
import { DateStrip } from '../../components/DateStrip';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton, Spinner, StatCardSkeleton, ListSkeleton } from '../../components/Spinner';
import { StatCard } from '../../components/StatCard';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';

const TREND_COLOR = '#27855c';

function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function ReportsPage() {
  const today = todayBusinessDate();
  const toast = useToast();

  const [date, setDate] = useState(today);
  const [mealType, setMealType] = useState<MealType | ''>('');
  const [customerType, setCustomerType] = useState<CustomerType | ''>('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [exporting, setExporting] = useState(false);
  const [exportingSummary, setExportingSummary] = useState(false);

  const dailyQuery = useQuery({
    queryKey: ['report-daily', { date, mealType, customerType, status }],
    queryFn: () =>
      getDailyReport({
        date,
        mealType: mealType || undefined,
        customerType: customerType || undefined,
        status: status || undefined,
      }),
  });

  const trendFrom = addDays(today, -6);
  const trendQuery = useQuery({
    queryKey: ['report-revenue', trendFrom, today],
    queryFn: () => getRevenueReport(trendFrom, today),
  });

  const report = dailyQuery.data;
  const trend = trendQuery.data;
  const trendData = (trend?.byDate ?? []).map((p) => ({
    label: shortDay(p.date),
    revenue: p.breakfastRevenue + p.lunchRevenue + p.dinnerRevenue,
  }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportReportCsv({
        from: date,
        to: date,
        mealType: mealType || undefined,
        customerType: customerType || undefined,
        status: status || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiffino-report-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Report exported', `tiffino-report-${date}.csv`);
    } catch (err) {
      toast.apiError(err, 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleCustomerSummary = async () => {
    setExportingSummary(true);
    try {
      const blob = await exportCustomerSummaryCsv();
      const filename = `tiffino-customer-summary-${today}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Customer summary exported', filename);
    } catch (err) {
      toast.apiError(err, 'Export failed');
    } finally {
      setExportingSummary(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={formatBusinessDate(date)}
        actions={
          <>
            <DateStrip date={date} onChange={setDate} />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Spinner className="h-4 w-4 border-white/40 border-t-white" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              title="All-time ledger: every customer's tiffin counts, billed, paid and pending"
              onClick={() => void handleCustomerSummary()}
              disabled={exportingSummary}
            >
              {exportingSummary ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Customer summary CSV
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Meal</label>
          <select className="input w-auto py-2.5" value={mealType} onChange={(e) => setMealType(e.target.value as MealType | '')}>
            <option value="">All meals</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
          </select>
        </div>
        <div>
          <label className="label">Customer type</label>
          <select className="input w-auto py-2.5" value={customerType} onChange={(e) => setCustomerType(e.target.value as CustomerType | '')}>
            <option value="">All types</option>
            <option value="regular">Regular</option>
            <option value="occasional">Occasional</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input w-auto py-2.5" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">All statuses</option>
            <option value="booked">Booked</option>
            <option value="prepared">Prepared</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {dailyQuery.isError ? (
        <div className="card">
          <ErrorState onRetry={() => dailyQuery.refetch()} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dailyQuery.isPending || !report ? (
              Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard icon={Coffee} label="Breakfast Orders" value={report.breakfastOrders} />
                <StatCard icon={Sun} label="Lunch Orders" value={report.lunchOrders} />
                <StatCard icon={Moon} label="Dinner Orders" value={report.dinnerOrders} variant="flame" />
                <StatCard
                  icon={UtensilsCrossed}
                  label="Total Tiffins"
                  value={report.totalTiffins}
                  sub={`${report.cancelledOrders} cancelled`}
                />
                <StatCard icon={IndianRupee} label="Lunch Revenue" value={formatINR(report.lunchRevenue)} />
                <StatCard
                  icon={IndianRupee}
                  label="Dinner Revenue"
                  value={formatINR(report.dinnerRevenue)}
                  variant="flame"
                />
                <StatCard
                  icon={IndianRupee}
                  label="Total Expected"
                  value={formatINR(report.totalRevenue)}
                  variant="success"
                />
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Customer-wise table */}
            <div className="card overflow-hidden xl:col-span-2">
              <div className="border-b border-[#f1e9dc] px-5 py-4">
                <h3 className="font-display text-base font-semibold text-charcoal">
                  Orders on {formatBusinessDate(date)}
                </h3>
              </div>
              {dailyQuery.isPending ? (
                <ListSkeleton />
              ) : (report?.rows.length ?? 0) === 0 ? (
                <EmptyState
                  variant="pot"
                  title={`No orders on ${formatBusinessDate(date)}`}
                  message="Book tiffins from Daily Orders and they land in this report."
                  action={
                    <Link to={`/daily-orders?date=${date}`} className="btn btn-flame">
                      Go to Daily Orders
                    </Link>
                  }
                  compact
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#f1e9dc] bg-cream/70">
                        <th className="th">Customer</th>
                        <th className="th">Type</th>
                        <th className="th">Meal</th>
                        <th className="th text-right">Price</th>
                        <th className="th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report?.rows ?? []).map((row) => {
                        const cancelled = row.status === 'cancelled';
                        return (
                          <tr
                            key={row.orderId}
                            className={cls(
                              'border-b border-[#f6f0e6] last:border-b-0',
                              cancelled && 'text-charcoal/40',
                            )}
                          >
                            <td className="td">
                              <Link
                                to={`/customers/${row.customerId}`}
                                className={cls(
                                  'text-sm font-semibold text-charcoal hover:text-forest-700',
                                  cancelled && 'line-through',
                                )}
                              >
                                {row.customerName}
                              </Link>
                              <span className="tnum block text-[11px] text-charcoal/45">
                                {row.customerMobile}
                              </span>
                            </td>
                            <td className="td">
                              <TypeChip type={row.customerType} />
                            </td>
                            <td className="td">
                              <MealChip meal={row.mealType} />
                            </td>
                            <td
                              className={cls(
                                'td tnum text-right text-sm font-semibold',
                                cancelled && 'line-through',
                              )}
                            >
                              {formatINR(row.price)}
                            </td>
                            <td className="td">
                              <StatusBadge status={row.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 7-day revenue trend */}
            <div className="card p-5">
              <h3 className="font-display text-base font-semibold text-charcoal">Last 7 days</h3>
              {trendQuery.isPending ? (
                <Skeleton className="mt-4 h-48 w-full" />
              ) : trendQuery.isError ? (
                <ErrorState onRetry={() => trendQuery.refetch()} />
              ) : trend ? (
                <>
                  <p className="tnum mt-1 text-sm text-charcoal/55">
                    {formatINR(trend.totalRevenue)} expected ·{' '}
                    <span className="text-success">{formatINR(trend.collected)} collected</span>
                  </p>
                  <div className="mt-4 h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={TREND_COLOR} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={TREND_COLOR} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#f1e9dc" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={{ stroke: '#e7decf' }}
                          tick={{ fontSize: 10, fill: '#6e6a63' }}
                        />
                        <YAxis
                          width={44}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: '#6e6a63' }}
                          tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`}
                        />
                        <Tooltip
                          formatter={(value: number) => [formatINR(value), 'Revenue']}
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid #efe7db',
                            boxShadow: '0 6px 20px rgba(27,67,50,0.1)',
                            fontSize: 12,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke={TREND_COLOR}
                          strokeWidth={2}
                          fill="url(#revFill)"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
