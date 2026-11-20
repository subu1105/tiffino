import bcrypt from 'bcryptjs';
import type { AuthResultDTO, Permission } from '@tiffino/shared';
import { env } from '../../config/env';
import { RefreshToken } from '../../models/RefreshToken';
import { User, type UserDoc } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
  signAccessToken,
} from '../../utils/jwt';
import { serializeUser } from '../../utils/serialize';

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function mintAccessToken(user: UserDoc): string {
  return signAccessToken({
    sub: user.id,
    role: user.role,
    permissions: user.permissions as Permission[],
    tokenVersion: user.tokenVersion,
  });
}

async function issueRefreshToken(
  user: UserDoc,
  familyId: string,
  deviceLabel: string,
): Promise<string> {
  const { token, hash } = generateRefreshToken();
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hash,
    familyId,
    deviceLabel,
    expiresAt: refreshExpiry(),
  });
  return token;
}

export async function login(
  email: string,
  password: string,
  deviceLabel: string,
): Promise<AuthResultDTO> {
  const user = await User.findOne({ email });
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    writeAudit({ action: 'auth.login_failed', entity: 'auth', meta: { email } });
    // Same message for wrong email and wrong password: no account enumeration.
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (user.status !== 'active') {
    writeAudit({ actorId: user.id, action: 'auth.login_blocked_inactive', entity: 'auth' });
    throw ApiError.unauthorized('This account has been deactivated');
  }

  const refreshToken = await issueRefreshToken(user, newFamilyId(), deviceLabel);
  writeAudit({ actorId: user.id, actorName: user.fullName, action: 'auth.login_success', entity: 'auth' });

  return { user: serializeUser(user), accessToken: mintAccessToken(user), refreshToken };
}

export async function rotateRefreshToken(
  presentedToken: string,
  deviceLabel: string,
): Promise<AuthResultDTO> {
  const hash = hashRefreshToken(presentedToken);
  const stored = await RefreshToken.findOne({ tokenHash: hash });

  if (!stored || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Session expired, please log in again', 'AUTH_REFRESH_INVALID');
  }

  if (stored.revokedAt) {
    // Reuse of a rotated token ⇒ assume theft; kill the whole family.
    await RefreshToken.updateMany(
      { familyId: stored.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    writeAudit({
      actorId: stored.userId,
      action: 'auth.refresh_reuse_detected',
      entity: 'auth',
      meta: { familyId: stored.familyId },
    });
    throw ApiError.unauthorized('Session expired, please log in again', 'AUTH_REFRESH_INVALID');
  }

  const user = await User.findById(stored.userId);
  if (!user || user.status !== 'active') {
    await RefreshToken.updateMany(
      { familyId: stored.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw ApiError.unauthorized('Account is not active', 'AUTH_REFRESH_INVALID');
  }

  const { token: newToken, hash: newHash } = generateRefreshToken();
  stored.revokedAt = new Date();
  stored.replacedByHash = newHash;
  await stored.save();
  await RefreshToken.create({
    userId: user._id,
    tokenHash: newHash,
    familyId: stored.familyId,
    deviceLabel,
    expiresAt: refreshExpiry(),
  });

  return { user: serializeUser(user), accessToken: mintAccessToken(user), refreshToken: newToken };
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;
  const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(presentedToken) });
  if (!stored) return;
  await RefreshToken.updateMany(
    { familyId: stored.familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  writeAudit({ actorId: stored.userId, action: 'auth.logout', entity: 'auth' });
}

export async function logoutAll(userId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  writeAudit({ actorId: userId, action: 'auth.logout_all', entity: 'auth' });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized();
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw ApiError.badRequest('Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);
  user.tokenVersion += 1;
  await user.save();
  // Other devices must log in again; access tokens die on the tokenVersion check.
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  writeAudit({ actorId: userId, actorName: user.fullName, action: 'auth.password_changed', entity: 'auth' });
}

/** Phase 1 ships no email/SMS channel, so this endpoint only points the person
 *  at the owner (staff) or the server CLI (owner). Phase 3 replaces it with OTP. */
export async function forgotPassword(email: string): Promise<string> {
  writeAudit({ action: 'auth.forgot_password_requested', entity: 'auth', meta: { email } });
  return 'Password reset is handled by the business owner. Staff: ask the owner to reset your password. Owner: run the reset-owner-password script on the server.';
}
