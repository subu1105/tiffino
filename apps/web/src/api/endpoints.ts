import type {
  AuthResultDTO,
  CookAttendanceDTO,
  CookAttendanceSummaryDTO,
  CookEntryDTO,
  CookLedgerDTO,
  CreateCookEntryInput,
  MarkCookAttendanceInput,
  BookingSheetRowDTO,
  BulkBookInput,
  BulkBookResultDTO,
  CreateCustomerInput,
  CreateOrderInput,
  CreateExpenseInput,
  CreatePaymentInput,
  CreateStaffInput,
  CreateStatementInput,
  ExpenseBookDayDTO,
  ExpenseDTO,
  ProfitLossDTO,
  StatementDTO,
  CustomerBalanceDTO,
  CustomerDTO,
  CustomerStatsDTO,
  CustomerStatus,
  CustomerType,
  DailyReportDTO,
  DashboardRevenueDTO,
  DashboardSummaryDTO,
  MealType,
  OrderDTO,
  OrderStatisticsDTO,
  OrderStatus,
  PaymentDTO,
  PaymentMethod,
  PriceHistoryDTO,
  RevenueReportDTO,
  UpdateCustomerInput,
  UpdateCustomerPricesInput,
  UpdateUserInput,
  UserDTO,
} from '@tiffino/shared';
import {
  apiDelete,
  apiGet,
  apiGetBlob,
  apiGetPaged,
  apiPatch,
  apiPost,
  apiPut,
  type Paged,
} from './client';

/* ---------- Auth ---------- */

export const login = (email: string, password: string) =>
  apiPost<AuthResultDTO>('/auth/login', { email, password });

export const logout = () => apiPost<{ message: string }>('/auth/logout', {});
export const logoutAll = () => apiPost<{ message: string }>('/auth/logout-all', {});

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiPost<{ message: string }>('/auth/change-password', { currentPassword, newPassword });

export const forgotPassword = (email: string) =>
  apiPost<{ message: string }>('/auth/forgot-password', { email });

/* ---------- Users (owner only) ---------- */

export const listUsers = () => apiGet<UserDTO[]>('/users');
export const createStaff = (input: CreateStaffInput) => apiPost<UserDTO>('/users/staff', input);
export const updateUser = (id: string, input: UpdateUserInput) =>
  apiPut<UserDTO>(`/users/${id}`, input);
export const setUserStatus = (id: string, status: 'active' | 'inactive') =>
  apiPatch<UserDTO>(`/users/${id}/status`, { status });
export const resetUserPassword = (id: string, newPassword: string) =>
  apiPatch<{ message: string }>(`/users/${id}/password`, { newPassword });

/* ---------- Customers ---------- */

export interface CustomersListParams {
  q?: string;
  type?: CustomerType | '';
  status?: CustomerStatus | '';
  page?: number;
  limit?: number;
  todayStatus?: '0' | '1';
}

export const listCustomers = (params: CustomersListParams): Promise<Paged<CustomerDTO[]>> =>
  apiGetPaged<CustomerDTO[]>('/customers', params);

export const getCustomer = (id: string) =>
  apiGet<{ customer: CustomerDTO; stats: CustomerStatsDTO }>(`/customers/${id}`);

export const createCustomer = (input: CreateCustomerInput) =>
  apiPost<CustomerDTO>('/customers', input);

export const updateCustomer = (id: string, input: UpdateCustomerInput) =>
  apiPut<CustomerDTO>(`/customers/${id}`, input);

export const setCustomerStatus = (id: string, status: CustomerStatus) =>
  apiPatch<CustomerDTO>(`/customers/${id}/status`, { status });

export const getCustomerPrices = (id: string) =>
  apiGet<{ lunchPrice: number; dinnerPrice: number; history: PriceHistoryDTO[] }>(
    `/customers/${id}/prices`,
  );

export const updateCustomerPrices = (id: string, input: UpdateCustomerPricesInput) =>
  apiPut<CustomerDTO>(`/customers/${id}/prices`, input);

/* ---------- Orders ---------- */

export const getBookingSheet = (date: string, q?: string) =>
  apiGet<BookingSheetRowDTO[]>('/orders/sheet', { date, q });

export const createOrder = (input: CreateOrderInput) => apiPost<OrderDTO>('/orders', input);

export const bulkBook = (input: BulkBookInput) =>
  apiPost<BulkBookResultDTO>('/orders/bulk-book', input);

export interface OrdersListParams {
  date?: string;
  from?: string;
  to?: string;
  mealType?: MealType | '';
  status?: OrderStatus | '';
  customerId?: string;
  customerType?: CustomerType | '';
  page?: number;
  limit?: number;
}

export const listOrders = (params: OrdersListParams): Promise<Paged<OrderDTO[]>> =>
  apiGetPaged<OrderDTO[]>('/orders', params);

export const updateOrderStatus = (id: string, status: 'prepared' | 'delivered') =>
  apiPatch<OrderDTO>(`/orders/${id}/status`, { status });

export const updateOrderQuantity = (id: string, quantity: number) =>
  apiPatch<OrderDTO>(`/orders/${id}/quantity`, { quantity });

export const cancelOrder = (id: string, reason?: string) =>
  apiPatch<OrderDTO>(`/orders/${id}/cancel`, { reason: reason ?? '' });

/* ---------- Dashboard ---------- */

export const getDashboardSummary = (date?: string) =>
  apiGet<DashboardSummaryDTO>('/dashboard/summary', { date });

export const getDashboardRevenue = (from: string, to: string) =>
  apiGet<DashboardRevenueDTO>('/dashboard/revenue', { from, to });

export const getOrderStatistics = (from: string, to: string) =>
  apiGet<OrderStatisticsDTO>('/dashboard/order-statistics', { from, to });

/* ---------- Payments ---------- */

export interface PaymentsListParams {
  customerId?: string;
  from?: string;
  to?: string;
  method?: PaymentMethod | '';
  page?: number;
  limit?: number;
}

export const listPayments = (
  params: PaymentsListParams,
): Promise<Paged<{ payments: PaymentDTO[]; totalAmount: number }>> =>
  apiGetPaged<{ payments: PaymentDTO[]; totalAmount: number }>('/payments', params);

export const createPayment = (input: CreatePaymentInput) => apiPost<PaymentDTO>('/payments', input);

export const getCustomerPayments = (customerId: string) =>
  apiGet<{ payments: PaymentDTO[]; balance: CustomerBalanceDTO }>(`/payments/customer/${customerId}`);

/* ---------- Reports ---------- */

export interface DailyReportParams {
  date?: string;
  mealType?: MealType | '';
  customerType?: CustomerType | '';
  status?: OrderStatus | '';
}

export const getDailyReport = (params: DailyReportParams) =>
  apiGet<DailyReportDTO>('/reports/daily', params);

export interface CustomerOrdersParams {
  customerId: string;
  from?: string;
  to?: string;
  mealType?: MealType | '';
  status?: OrderStatus | '';
}

export const getCustomerOrdersReport = (params: CustomerOrdersParams) =>
  apiGet<{ orders: OrderDTO[]; totalOrders: number; totalAmount: number }>(
    '/reports/customer-orders',
    params,
  );

export const getRevenueReport = (from: string, to: string) =>
  apiGet<RevenueReportDTO>('/reports/revenue', { from, to });

export interface ExportReportParams {
  from: string;
  to: string;
  mealType?: MealType | '';
  customerType?: CustomerType | '';
  status?: OrderStatus | '';
}

export const exportReportCsv = (params: ExportReportParams) =>
  apiGetBlob('/reports/export', params);

/** All-time per-customer ledger: tiffin counts + billed/paid/pending. */
export const exportCustomerSummaryCsv = () => apiGetBlob('/reports/customer-summary/export');

/* ---------- Statements ---------- */

export const createStatement = (input: CreateStatementInput) =>
  apiPost<StatementDTO>('/statements', input);

/** Without customerId: recent statements for ALL customers, name-wise. */
export const listStatements = (customerId?: string) =>
  apiGet<StatementDTO[]>('/statements', customerId ? { customerId } : undefined);

export const deleteStatement = (id: string) => apiDelete<{ message: string }>(`/statements/${id}`);

/* ---------- Expenses & Profit/Loss ---------- */

export const addExpense = (input: CreateExpenseInput) => apiPost<ExpenseDTO>('/expenses', input);

export const deleteExpense = (id: string) => apiDelete<{ message: string }>(`/expenses/${id}`);

export const getExpenseBook = (from: string, to: string) =>
  apiGet<{ days: ExpenseBookDayDTO[]; grandTotal: number }>('/expenses/book', { from, to });

export const exportExpensesCsv = (from: string, to: string) =>
  apiGetBlob('/expenses/export', { from, to });

export const getProfitLoss = (params: {
  filter?: 'today' | 'yesterday' | 'this-week' | 'this-month';
  from?: string;
  to?: string;
}) => apiGet<ProfitLossDTO>('/expenses/profit-loss', params);

/* ---------- Cook ledger ---------- */

export const addCookEntry = (input: CreateCookEntryInput) =>
  apiPost<CookEntryDTO>('/cook-ledger', input);

export const deleteCookEntry = (id: string) =>
  apiDelete<{ message: string }>(`/cook-ledger/${id}`);

export const getCookLedger = (from?: string, to?: string) =>
  apiGet<CookLedgerDTO>('/cook-ledger', { from, to });

export const markCookAttendance = (input: MarkCookAttendanceInput) =>
  apiPost<CookAttendanceDTO>('/cook-ledger/attendance', input);

export const getCookAttendance = (from?: string, to?: string) =>
  apiGet<CookAttendanceSummaryDTO>('/cook-ledger/attendance', { from, to });

export const deleteCookAttendance = (id: string) =>
  apiDelete<{ message: string }>(`/cook-ledger/attendance/${id}`);
