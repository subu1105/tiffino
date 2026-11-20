/**
 * TIFFINO API client.
 *
 * - Access token lives in memory only.
 * - Refresh token + a cached user snapshot live in expo-secure-store.
 * - Every response is the shared envelope: { success, data, meta? } | { success:false, error }.
 * - On 401 the client performs a single-flight POST /auth/refresh (body transport —
 *   no cookies on native), stores the rotated token and retries the request once.
 *   If the refresh itself fails, the session is cleared and the auth-failure
 *   listener (wired by AuthProvider) forces a re-login.
 */
import type {
  ApiErrorBody,
  ApiMeta,
  AuthResultDTO,
  ErrorCode,
  UserDTO,
} from '@tiffino/shared';
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const REFRESH_TOKEN_KEY = 'tiffino_refresh_token';
const CACHED_USER_KEY = 'tiffino_cached_user';

/* ---------------- secure storage (no-ops gracefully on web) ---------------- */

async function storeGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage failures must never crash the app; the user just logs in again.
  }
}

/* ---------------- token/session state ---------------- */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): Promise<string | null> {
  return storeGet(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null): Promise<void> {
  return storeSet(REFRESH_TOKEN_KEY, token);
}

export async function getCachedUser(): Promise<UserDTO | null> {
  const raw = await storeGet(CACHED_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserDTO;
  } catch {
    return null;
  }
}

export function setCachedUser(user: UserDTO | null): Promise<void> {
  return storeSet(CACHED_USER_KEY, user ? JSON.stringify(user) : null);
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  await setRefreshToken(null);
  await setCachedUser(null);
}

/** AuthProvider registers here so a dead refresh token forces re-login. */
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(cb: (() => void) | null): void {
  onAuthFailure = cb;
}

/* ---------------- typed errors ---------------- */

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode | 'NETWORK_ERROR', message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body && body.success === false && body.error) {
      return new ApiError(body.error.code, body.error.message, err.response?.status ?? 0, body.error.details);
    }
    if (!err.response) {
      return new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection.', 0);
    }
    return new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', err.response.status);
  }
  return new ApiError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Something went wrong.', 0);
}

/* ---------------- axios instance + refresh flow ---------------- */

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshInFlight: Promise<string> | null = null;

/** Single-flight refresh. Resolves to a fresh access token; rejects → session dead. */
export function refreshSession(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new ApiError('AUTH_REFRESH_INVALID', 'No refresh token stored', 401);
      }
      // Raw axios (not `api`) so this request never recurses into the interceptor.
      const res = await axios.post<{ success: true; data: AuthResultDTO }>(
        `${API_URL}/api/auth/refresh`,
        { refreshToken },
        { timeout: 20000 },
      );
      const data = res.data.data;
      accessToken = data.accessToken;
      // The refresh token ROTATES on every call — always persist the new one.
      if (data.refreshToken) await setRefreshToken(data.refreshToken);
      await setCachedUser(data.user);
      return data.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

interface RetriableConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const url = config?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (error.response?.status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true;
      try {
        const token = await refreshSession();
        config.headers = { ...(config.headers as object), Authorization: `Bearer ${token}` };
        return api.request(config);
      } catch (refreshErr) {
        const apiErr = toApiError(refreshErr);
        // Only a SERVER verdict kills the session. A network hiccup / server
        // restart must keep the stored refresh token so the next 401 retries.
        if (apiErr.status === 401) {
          await clearSession();
          onAuthFailure?.();
        }
        throw apiErr;
      }
    }
    throw toApiError(error);
  },
);

/* ---------------- envelope-aware helpers ---------------- */

export interface Enveloped<T> {
  data: T;
  meta?: ApiMeta;
}

async function request<T>(config: AxiosRequestConfig): Promise<Enveloped<T>> {
  const res = await api.request<{ success: true; data: T; meta?: ApiMeta }>(config);
  return { data: res.data.data, meta: res.data.meta };
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<Enveloped<T>> {
  return request<T>({ method: 'get', url, params });
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return (await request<T>({ method: 'post', url, data: body })).data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  return (await request<T>({ method: 'put', url, data: body })).data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return (await request<T>({ method: 'patch', url, data: body })).data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  return (await request<T>({ method: 'delete', url })).data;
}
