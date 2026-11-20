import type { Request, Response } from 'express';
import type { ChangePasswordInput, ForgotPasswordInput, LoginInput, RefreshInput } from '@tiffino/shared';
import { env } from '../../config/env';
import { ok } from '../../utils/respond';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'tiffino_refresh';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function deviceLabel(req: Request): string {
  return (req.headers['x-client'] as string) || req.headers['user-agent']?.slice(0, 80) || 'unknown';
}

/** Web stores the refresh token only in this httpOnly cookie; mobile reads it
 *  from the body into SecureStore. The access token is always in the body. */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const result = await authService.login(email, password, deviceLabel(req));
  res.cookie(REFRESH_COOKIE, result.refreshToken!, refreshCookieOptions());
  ok(res, result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const body = req.body as RefreshInput;
  const presented = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
  if (!presented) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_REFRESH_INVALID', message: 'No refresh token provided' },
    });
    return;
  }
  const result = await authService.rotateRefreshToken(presented, deviceLabel(req));
  res.cookie(REFRESH_COOKIE, result.refreshToken!, refreshCookieOptions());
  ok(res, result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as RefreshInput;
  const presented = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
  await authService.logout(presented);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  ok(res, { message: 'Logged out' });
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await authService.logoutAll(req.user!.id);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  ok(res, { message: 'Logged out from all devices' });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  ok(res, { message: 'Password changed. Please log in again on other devices.' });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as ForgotPasswordInput;
  const message = await authService.forgotPassword(email);
  ok(res, { message });
}

export async function me(req: Request, res: Response): Promise<void> {
  ok(res, {
    id: req.user!.id,
    fullName: req.user!.fullName,
    role: req.user!.role,
    permissions: req.user!.permissions,
  });
}
