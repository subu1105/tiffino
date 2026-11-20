export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export const CUSTOMER_TYPES = ['regular', 'occasional'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_STATUSES = ['active', 'inactive'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const ORDER_STATUSES = ['booked', 'prepared', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Forward transitions an authorized user may apply via PATCH /orders/:id/status.
 *  Cancellation is a separate endpoint and is never part of this map. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  booked: ['prepared', 'delivered'],
  prepared: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ROLES = ['owner', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** The complete permission catalog. Role 'owner' implicitly holds every permission;
 *  role 'staff' carries an explicit subset, enforced server-side on every route. */
export const PERMISSIONS = [
  'dashboard.view',
  'customers.view',
  'customers.manage',
  'orders.view',
  'orders.book',
  'orders.updateStatus',
  'orders.cancel',
  'orders.overridePrice',
  'payments.view',
  'payments.record',
  'reports.view',
  'expenses.view',
  'expenses.record',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'View dashboard',
  'customers.view': 'View customers',
  'customers.manage': 'Add & edit customers',
  'orders.view': 'View daily orders',
  'orders.book': 'Book lunch & dinner',
  'orders.updateStatus': 'Update order status',
  'orders.cancel': 'Cancel orders',
  'orders.overridePrice': 'Override booking price',
  'payments.view': 'View payments',
  'payments.record': 'Record payments',
  'reports.view': 'View reports & export',
  'expenses.view': 'View expenses & profit/loss',
  'expenses.record': 'Add & delete expenses',
};

/** Sensible default grant for kitchen/delivery staff; the owner edits per user. */
export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'customers.view',
  'orders.view',
  'orders.book',
  'orders.updateStatus',
  'payments.view',
];

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_STALE',
  'AUTH_REFRESH_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'DUPLICATE_BOOKING',
  'DUPLICATE_RESOURCE',
  'CUSTOMER_INACTIVE',
  'ORDER_NOT_ACTIVE',
  'ORDER_ALREADY_CANCELLED',
  'INVALID_STATUS_TRANSITION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const DASHBOARD_FILTERS = ['today', 'yesterday', 'this-week', 'this-month'] as const;
export type DashboardFilter = (typeof DASHBOARD_FILTERS)[number];

/** Brand tokens shared by web (Tailwind) and mobile (NativeWind). */
export const BRAND_COLORS = {
  forest: {
    50: '#eef6f1',
    100: '#d5e8dd',
    200: '#aed2bf',
    300: '#7fb69c',
    400: '#52977a',
    500: '#357c60',
    600: '#27654e',
    700: '#1f5240',
    800: '#1b4332',
    900: '#143627',
    950: '#0b2118',
  },
  flame: {
    50: '#fff4e5',
    100: '#ffe3bf',
    200: '#ffc98c',
    300: '#ffab52',
    400: '#fb8f26',
    500: '#f77f00',
    600: '#d96b00',
    700: '#b35505',
    800: '#8f440b',
    900: '#75390d',
  },
  cream: '#FFF8F0',
  card: '#FFFFFF',
  charcoal: '#2B2D2F',
  success: '#2E9E5B',
  warning: '#E8930C',
  danger: '#E05B4C',
} as const;
