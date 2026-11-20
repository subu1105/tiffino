import type {
  CustomerStatus,
  CustomerType,
  ErrorCode,
  MealType,
  OrderStatus,
  PaymentMethod,
  Permission,
  Role,
  UserStatus,
} from './constants';

/* ---------- API envelope ---------- */

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

/* ---------- DTOs (what the API serialises) ---------- */

export interface UserDTO {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  permissions: Permission[];
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResultDTO {
  user: UserDTO;
  accessToken: string;
  /** Present for mobile clients; web receives it as an httpOnly cookie instead. */
  refreshToken?: string;
}

export interface CustomerDTO {
  id: string;
  fullName: string;
  mobile: string;
  address: string;
  type: CustomerType;
  breakfastPrice: number;
  lunchPrice: number;
  dinnerPrice: number;
  joiningDate: string;
  status: CustomerStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Present when requested with todayStatus=1. */
  todayBreakfast?: OrderStatus | null;
  todayLunch?: OrderStatus | null;
  todayDinner?: OrderStatus | null;
}

export interface PriceHistoryDTO {
  id: string;
  customerId: string;
  breakfastPrice: number;
  lunchPrice: number;
  dinnerPrice: number;
  prevBreakfastPrice: number | null;
  prevLunchPrice: number | null;
  prevDinnerPrice: number | null;
  effectiveDate: string;
  changedByName: string;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  customerId: string;
  customerName: string;
  customerMobile?: string;
  orderDate: string;
  mealType: MealType;
  customerTypeSnapshot: CustomerType;
  /** TOTAL for the line: unitPrice × quantity (aggregations stay simple). */
  price: number;
  unitPrice: number;
  quantity: number;
  priceOverridden: boolean;
  status: OrderStatus;
  active: boolean;
  cancelledAt: string | null;
  cancellationReason: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** One row of the Daily Orders screen: a customer plus their bookings for the date. */
export interface BookingSheetRowDTO {
  customer: Pick<
    CustomerDTO,
    'id' | 'fullName' | 'mobile' | 'type' | 'breakfastPrice' | 'lunchPrice' | 'dinnerPrice'
  >;
  breakfast: OrderDTO | null;
  lunch: OrderDTO | null;
  dinner: OrderDTO | null;
}

export interface BulkBookResultDTO {
  booked: number;
  skipped: number;
  skippedCustomers: {
    id: string;
    fullName: string;
    reason: 'already-booked' | 'inactive' | 'no-price';
  }[];
}

export interface PaymentDTO {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  notes: string;
  recordedByName: string;
  createdAt: string;
  /** Set when this payment was settled against a specific statement. */
  statementId: string | null;
  statementPeriodLabel: string | null;
}

export interface CustomerBalanceDTO {
  totalBilled: number;
  totalPaid: number;
  pending: number;
}

export interface CustomerStatsDTO extends CustomerBalanceDTO {
  totalBreakfastOrders: number;
  totalLunchOrders: number;
  totalDinnerOrders: number;
  cancelledOrders: number;
}

/** A generated-statement record: proof of what was billed to the customer and
 *  what was pending at that moment — compare with later payments. */
export interface StatementDTO {
  id: string;
  customerId: string;
  customerName: string;
  periodLabel: string;
  from: string | null;
  to: string | null;
  totalTiffins: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  /** Amount for the statement period (active orders only). */
  periodAmount: number;
  /** All-time position at generation time. */
  totalBilled: number;
  totalPaid: number;
  pending: number;
  generatedByName: string;
  createdAt: string;
  /** Money recorded AFTER this statement was generated — the settlement check. */
  receivedSince: number;
  /** settled: received ≥ pending (or nothing was owed) · partial: some received
   *  · awaiting: nothing received yet. */
  settlementStatus: 'settled' | 'partial' | 'awaiting';
}

/* ---------- Expenses & Profit/Loss ---------- */

export interface ExpenseDTO {
  id: string;
  expenseDate: string;
  item: string;
  amount: number;
  notes: string;
  recordedByName: string;
  createdAt: string;
}

/** One day of the expense book: all items of that date plus the day total. */
export interface ExpenseBookDayDTO {
  date: string;
  items: ExpenseDTO[];
  total: number;
}

export interface ProfitLossPointDTO {
  date: string;
  revenue: number;
  /** Kharcha-book total + cook wage for the day. */
  expense: number;
  /** Portion of `expense` that is the cook's worked-day wage. */
  cookWage: number;
  profit: number;
}

export interface ProfitLossDTO {
  from: string;
  to: string;
  /** Tiffin revenue: active orders' snapshotted prices in the range. */
  revenue: number;
  /** Kharcha-book total + cook wages. */
  expense: number;
  /** Portion of `expense` from the cook's worked days. */
  cookWage: number;
  profit: number;
  byDate: ProfitLossPointDTO[];
}

/* ---------- Cook ledger ---------- */

export interface CookEntryDTO {
  id: string;
  entryDate: string;
  /** paid = money given TO the cook · return = money the cook gave back. */
  kind: 'paid' | 'return';
  amount: number;
  notes: string;
  recordedByName: string;
  createdAt: string;
}

export interface CookLedgerDTO {
  entries: CookEntryDTO[];
  totalPaid: number;
  totalReturned: number;
  /** paid − returned: what has actually gone to the cook, net. */
  net: number;
}

export interface CookAttendanceDTO {
  id: string;
  date: string;
  status: 'worked' | 'half-day' | 'leave';
  /** Wage snapshot for that day (0 on leave) — flows into profit & loss. */
  dailyRate: number;
  recordedByName: string;
  createdAt: string;
}

export interface CookAttendanceSummaryDTO {
  days: CookAttendanceDTO[];
  workedDays: number;
  halfDays: number;
  leaveDays: number;
  /** Sum of worked-day wages in the range — the P&L cook cost. */
  wageTotal: number;
  /** Most recent worked-day rate ever (prefill for the next marking). */
  lastRate: number | null;
}

/* ---------- Dashboard ---------- */

export interface DashboardSummaryDTO {
  date: string;
  activeCustomers: number;
  regularCustomers: number;
  occasionalCustomers: number;
  breakfastOrders: number;
  lunchOrders: number;
  dinnerOrders: number;
  totalOrders: number;
  expectedRevenue: number;
  /** All-time: billed (active orders) − collected (payments). */
  pendingPayments: number;
  recentBookings: OrderDTO[];
  recentCustomers: Pick<CustomerDTO, 'id' | 'fullName' | 'type' | 'createdAt'>[];
}

export interface DashboardRevenueDTO {
  from: string;
  to: string;
  breakfastOrders: number;
  lunchOrders: number;
  dinnerOrders: number;
  totalOrders: number;
  breakfastRevenue: number;
  lunchRevenue: number;
  dinnerRevenue: number;
  totalRevenue: number;
  collected: number;
}

export interface OrderStatisticsPointDTO {
  date: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  breakfastRevenue: number;
  lunchRevenue: number;
  dinnerRevenue: number;
}

export interface OrderStatisticsDTO {
  from: string;
  to: string;
  points: OrderStatisticsPointDTO[];
}

/* ---------- Reports ---------- */

export interface DailyReportRowDTO {
  orderId: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  customerType: CustomerType;
  mealType: MealType;
  quantity: number;
  price: number;
  status: OrderStatus;
}

export interface DailyReportDTO {
  date: string;
  breakfastOrders: number;
  lunchOrders: number;
  dinnerOrders: number;
  totalTiffins: number;
  breakfastRevenue: number;
  lunchRevenue: number;
  dinnerRevenue: number;
  totalRevenue: number;
  cancelledOrders: number;
  rows: DailyReportRowDTO[];
}

export interface RevenueReportDTO {
  from: string;
  to: string;
  totalOrders: number;
  breakfastRevenue: number;
  lunchRevenue: number;
  dinnerRevenue: number;
  totalRevenue: number;
  collected: number;
  byDate: OrderStatisticsPointDTO[];
}
