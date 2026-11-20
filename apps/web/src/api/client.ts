import type { ApiErrorBody, ApiMeta, ApiSuccess, AuthResultDTO, ErrorCode } from '@tiffino/shared';
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

/* ---------------------------------------------------------------- *
 * Typed error the whole UI catches.
 * ---------------------------------------------------------------- */

export type AppErrorCode = ErrorCode | 'NETWORK_ERROR';

export class AppApiError extends Error {
  readonly code: AppErrorCode;
  readonly details?: unknown;
  readonly status?: number;

  constructor(code: AppErrorCode, message: string, details?: unknown, status?: number) {
    super(message);
    this.name = 'AppApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export function isApiError(err: unknown, code?: AppErrorCode): err is AppApiError {
  if (!(err instanceof AppApiError)) return false;
  return code ? err.code === code : true;
}

export function errorMessage(err: unknown): string {
  if (err instanceof AppApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** Server VALIDATION_ERROR details → { fieldName: message } for inline form errors. */
export function fieldErrorsFromDetails(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(details)) {
    for (const item of details) {
      if (item && typeof item === 'object' && 'path' in item && 'message' in item) {
        const path = String((item as { path: unknown }).path);
        if (!(path in out)) out[path] = String((item as { message: unknown }).message);
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * Access token (memory only — never persisted) + session hooks.
 * ---------------------------------------------------------------- */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

let sessionExpiredHandler: (() => void) | null = null;
let sessionRefreshedHandler: ((auth: AuthResultDTO) => void) | null = null;

export function onSessionExpired(handler: () => void): void {
  sessionExpiredHandler = handler;
}

export function onSessionRefreshed(handler: (auth: AuthResultDTO) => void): void {
  sessionRefreshedHandler = handler;
}

/* ---------------------------------------------------------------- *
 * Axios instance.
 * ---------------------------------------------------------------- */

export const api = axios.create({
  // Dev proxies /api to localhost:4000; production builds point at the real
  // API host via VITE_API_URL (set in apps/web/.env.production).
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) || '/api',
  withCredentials: true,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/** Cookie-based refresh.
 *  Resolves: the new session on success · `null` when the SERVER rejected the
 *  cookie (session truly invalid) · `undefined` on transport failure (offline,
 *  server restarting) — the session may still be fine, so callers must never
 *  log the user out on `undefined`.
 *  Single-flight within this tab, plus a cross-tab Web Lock: the server rotates
 *  the refresh token on every call and treats reuse of a rotated token as theft
 *  (whole family revoked), so two tabs must never race the rotation. */
export type RefreshOutcome = AuthResultDTO | null | undefined;

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function doRefresh(): Promise<RefreshOutcome> {
  try {
    const res = await axios.post<ApiSuccess<AuthResultDTO>>(
      '/api/auth/refresh',
      {},
      { withCredentials: true, timeout: 15000 },
    );
    const auth = res.data.data;
    setAccessToken(auth.accessToken);
    sessionRefreshedHandler?.(auth);
    return auth;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) return null;
    return undefined;
  }
}

export function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    refreshPromise = (
      locks
        ? (locks.request('tiffino-auth-refresh', doRefresh) as unknown as Promise<RefreshOutcome>)
        : doRefresh()
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

const RETRYABLE_401 = new Set<string>(['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_STALE', 'UNAUTHORIZED']);

async function parseErrorBody(error: AxiosError): Promise<ApiErrorBody | null> {
  const data = error.response?.data;
  if (!data) return null;
  try {
    if (data instanceof Blob) {
      const text = await data.text();
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && 'error' in parsed) return parsed as ApiErrorBody;
      return null;
    }
    if (typeof data === 'object' && 'error' in data) return data as ApiErrorBody;
  } catch {
    /* non-JSON body */
  }
  return null;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const body = await parseErrorBody(error);
    const code = body?.error.code;
    const url = config?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (
      status === 401 &&
      config &&
      !config._retried &&
      !isAuthEndpoint &&
      (!code || RETRYABLE_401.has(code))
    ) {
      const refreshed = await refreshSession();
      if (refreshed) {
        config._retried = true;
        return api(config);
      }
      // null = server rejected the session; undefined = network hiccup — the
      // session may be fine, so surface the original error instead of logging out.
      if (refreshed === null) sessionExpiredHandler?.();
    }

    if (body) {
      throw new AppApiError(body.error.code, body.error.message, body.error.details, status);
    }
    throw new AppApiError(
      'NETWORK_ERROR',
      'Cannot reach the TIFFINO server — check your connection and try again.',
      undefined,
      status,
    );
  },
);

/* ---------------------------------------------------------------- *
 * Envelope-unwrapping helpers.
 * ---------------------------------------------------------------- */

export interface Paged<T> {
  data: T;
  meta: ApiMeta;
}

/** Loose on purpose: feature param interfaces (no index signature) are accepted. */
type Params = object;

function clean(params?: Params): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export async function apiGet<T>(url: string, params?: Params): Promise<T> {
  const res = await api.get<ApiSuccess<T>>(url, { params: clean(params) });
  return res.data.data;
}

export async function apiGetPaged<T>(url: string, params?: Params): Promise<Paged<T>> {
  const res = await api.get<ApiSuccess<T>>(url, { params: clean(params) });
  const meta = res.data.meta ?? { page: 1, limit: 0, total: 0, totalPages: 1 };
  return { data: res.data.data, meta };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.post<ApiSuccess<T>>(url, body ?? {});
  return res.data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.put<ApiSuccess<T>>(url, body ?? {});
  return res.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.patch<ApiSuccess<T>>(url, body ?? {});
  return res.data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await api.delete<ApiSuccess<T>>(url);
  return res.data.data;
}

/** For CSV export — the response is a raw attachment, not the JSON envelope. */
export async function apiGetBlob(url: string, params?: Params): Promise<Blob> {
  const res = await api.get<Blob>(url, { params: clean(params), responseType: 'blob' });
  return res.data;
}
