/**
 * Query-key catalog + typed fetchers. Every screen talks to the API through
 * these, so invalidation stays consistent:
 *   ['dashboard']                 — summary, order-statistics
 *   ['sheet', date]               — the Daily Orders booking sheet
 *   ['customers']                 — list / detail / prices
 *   ['payments']                  — payment lists & balances
 *   ['reports']                   — daily report, customer orders
 */
import type {
  BookingSheetRowDTO,
  CookAttendanceDTO,
  CookAttendanceSummaryDTO,
  CookEntryDTO,
  CookLedgerDTO,
  BulkBookResultDTO,
  CustomerBalanceDTO,
  CustomerDTO,
  CustomerStatsDTO,
  DailyReportDTO,
  DashboardSummaryDTO,
  MealType,
  ExpenseBookDayDTO,
  ExpenseDTO,
  OrderDTO,
  OrderStatisticsDTO,
  PaymentDTO,
  PriceHistoryDTO,
  ProfitLossDTO,
  StatementDTO,
} from '@tiffino/shared';
import { api, apiDelete, apiGet, apiPatch, apiPost, apiPut, type Enveloped } from '@/lib/api';

/* ---------------- dashboard ---------------- */

export async function fetchDashboardSummary(date?: string): Promise<DashboardSummaryDTO> {
  return (await apiGet<DashboardSummaryDTO>('/dashboard/summary', date ? { date } : undefined)).data;
}

export async function fetchOrderStatistics(from: string, to: string): Promise<OrderStatisticsDTO> {
  return (await apiGet<OrderStatisticsDTO>('/dashboard/order-statistics', { from, to })).data;
}

/* ---------------- orders ---------------- */

export async function fetchBookingSheet(date: string, q?: string): Promise<BookingSheetRowDTO[]> {
  return (await apiGet<BookingSheetRowDTO[]>('/orders/sheet', { date, ...(q ? { q } : {}) })).data;
}

export function bookOrder(input: {
  customerId: string;
  orderDate: string;
  mealType: MealType;
  quantity?: number;
  priceOverride?: number;
}): Promise<OrderDTO> {
  return apiPost<OrderDTO>('/orders', input);
}

export function updateOrderQuantity(orderId: string, quantity: number): Promise<OrderDTO> {
  return apiPatch<OrderDTO>(`/orders/${orderId}/quantity`, { quantity });
}

export function bulkBook(input: {
  orderDate: string;
  mealType: MealType;
  mode: 'all-regular' | 'selected';
  customerIds?: string[];
}): Promise<BulkBookResultDTO> {
  return apiPost<BulkBookResultDTO>('/orders/bulk-book', input);
}

export function updateOrderStatus(orderId: string, status: 'prepared' | 'delivered'): Promise<OrderDTO> {
  return apiPatch<OrderDTO>(`/orders/${orderId}/status`, { status });
}

export function cancelOrder(orderId: string, reason: string): Promise<OrderDTO> {
  return apiPatch<OrderDTO>(`/orders/${orderId}/cancel`, { reason });
}

export async function fetchOrders(params: {
  customerId?: string;
  from?: string;
  to?: string;
  mealType?: MealType;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<Enveloped<OrderDTO[]>> {
  return apiGet<OrderDTO[]>('/orders', params);
}

/* ---------------- customers ---------------- */

export interface CustomersListParams {
  q?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
  todayStatus?: '0' | '1';
}

export async function fetchCustomers(params: CustomersListParams): Promise<Enveloped<CustomerDTO[]>> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') clean[k] = v;
  }
  return apiGet<CustomerDTO[]>('/customers', clean);
}

export interface CustomerDetail {
  customer: CustomerDTO;
  stats: CustomerStatsDTO;
}

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  return (await apiGet<CustomerDetail>(`/customers/${id}`)).data;
}

export interface CustomerPrices {
  lunchPrice: number;
  dinnerPrice: number;
  history: PriceHistoryDTO[];
}

export async function fetchCustomerPrices(id: string): Promise<CustomerPrices> {
  return (await apiGet<CustomerPrices>(`/customers/${id}/prices`)).data;
}

export function createCustomer(body: unknown): Promise<CustomerDTO> {
  return apiPost<CustomerDTO>('/customers', body);
}

export function updateCustomer(id: string, body: unknown): Promise<CustomerDTO> {
  return apiPut<CustomerDTO>(`/customers/${id}`, body);
}

export function updateCustomerPrices(
  id: string,
  body: { breakfastPrice?: number; lunchPrice: number; dinnerPrice: number; effectiveDate?: string },
): Promise<CustomerPrices> {
  return apiPut<CustomerPrices>(`/customers/${id}/prices`, body);
}

export function setCustomerStatus(id: string, status: 'active' | 'inactive'): Promise<CustomerDTO> {
  return apiPatch<CustomerDTO>(`/customers/${id}/status`, { status });
}

/* ---------------- payments ---------------- */

export interface CustomerPayments {
  payments: PaymentDTO[];
  balance: CustomerBalanceDTO;
}

export async function fetchCustomerPayments(customerId: string): Promise<CustomerPayments> {
  return (await apiGet<CustomerPayments>(`/payments/customer/${customerId}`)).data;
}

export function recordPayment(body: unknown): Promise<PaymentDTO> {
  return apiPost<PaymentDTO>('/payments', body);
}

/* ---------------- reports ---------------- */

export async function fetchDailyReport(date: string): Promise<DailyReportDTO> {
  return (await apiGet<DailyReportDTO>('/reports/daily', { date })).data;
}

export interface CustomerOrdersReport {
  orders: OrderDTO[];
  totalOrders: number;
  totalAmount: number;
}

export async function fetchCustomerOrdersReport(params: {
  customerId: string;
  from?: string;
  to?: string;
}): Promise<CustomerOrdersReport> {
  const clean: Record<string, unknown> = { customerId: params.customerId };
  if (params.from) clean.from = params.from;
  if (params.to) clean.to = params.to;
  return (await apiGet<CustomerOrdersReport>('/reports/customer-orders', clean)).data;
}

/* ---------------- CSV export ---------------- */

/** Raw CSV text from /reports/export — the response is an attachment, not the
 *  JSON envelope, so it bypasses the envelope helpers. */
export async function fetchReportCsv(from: string, to: string): Promise<string> {
  const res = await api.get<string>('/reports/export', {
    params: { from, to },
    responseType: 'text',
    // Stop axios from trying to JSON.parse the CSV body.
    transformResponse: (data) => data,
  });
  return res.data;
}

/** All-time per-customer ledger CSV: tiffin counts + billed/paid/pending. */
export async function fetchCustomerSummaryCsv(): Promise<string> {
  const res = await api.get<string>('/reports/customer-summary/export', {
    responseType: 'text',
    transformResponse: (data) => data,
  });
  return res.data;
}

/* ---------------- statements ---------------- */

export function createStatement(input: {
  customerId: string;
  periodLabel: string;
  from?: string;
  to?: string;
}): Promise<StatementDTO> {
  const body: Record<string, unknown> = {
    customerId: input.customerId,
    periodLabel: input.periodLabel,
  };
  if (input.from) body.from = input.from;
  if (input.to) body.to = input.to;
  return apiPost<StatementDTO>('/statements', body);
}

/** Without customerId: recent statements for ALL customers, name-wise. */
export async function fetchStatements(customerId?: string): Promise<StatementDTO[]> {
  return (await apiGet<StatementDTO[]>('/statements', customerId ? { customerId } : undefined)).data;
}

export function deleteStatement(id: string): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/statements/${id}`);
}

/* ---------------- expenses & profit/loss ---------------- */

export function addExpense(input: {
  expenseDate: string;
  item: string;
  amount: number;
  notes?: string;
}): Promise<ExpenseDTO> {
  return apiPost<ExpenseDTO>('/expenses', { notes: '', ...input });
}

export function deleteExpense(id: string): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/expenses/${id}`);
}

export async function fetchExpenseBook(
  from: string,
  to: string,
): Promise<{ days: ExpenseBookDayDTO[]; grandTotal: number }> {
  return (
    await apiGet<{ days: ExpenseBookDayDTO[]; grandTotal: number }>('/expenses/book', { from, to })
  ).data;
}

export async function fetchExpenseCsv(from: string, to: string): Promise<string> {
  const res = await api.get<string>('/expenses/export', {
    params: { from, to },
    responseType: 'text',
    transformResponse: (data) => data,
  });
  return res.data;
}

export async function fetchProfitLoss(params: {
  filter?: 'today' | 'yesterday' | 'this-week' | 'this-month';
  from?: string;
  to?: string;
}): Promise<ProfitLossDTO> {
  return (await apiGet<ProfitLossDTO>('/expenses/profit-loss', params)).data;
}

/* ---------------- cook ledger ---------------- */

export function addCookEntry(input: {
  entryDate: string;
  kind: 'paid' | 'return';
  amount: number;
  notes?: string;
}): Promise<CookEntryDTO> {
  return apiPost<CookEntryDTO>('/cook-ledger', { notes: '', ...input });
}

export function deleteCookEntry(id: string): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/cook-ledger/${id}`);
}

export async function fetchCookLedger(from?: string, to?: string): Promise<CookLedgerDTO> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  return (await apiGet<CookLedgerDTO>('/cook-ledger', params)).data;
}

export function markCookAttendance(input: {
  date: string;
  status: 'worked' | 'half-day' | 'leave';
  dailyRate?: number;
}): Promise<CookAttendanceDTO> {
  return apiPost<CookAttendanceDTO>('/cook-ledger/attendance', input);
}

export async function fetchCookAttendance(
  from?: string,
  to?: string,
): Promise<CookAttendanceSummaryDTO> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  return (await apiGet<CookAttendanceSummaryDTO>('/cook-ledger/attendance', params)).data;
}

export function deleteCookAttendance(id: string): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/cook-ledger/attendance/${id}`);
}
