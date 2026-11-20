import bcrypt from 'bcryptjs';
import type { CreateStaffInput, UpdateUserInput, UserDTO, UserStatus } from '@tiffino/shared';
import { env } from '../../config/env';
import { RefreshToken } from '../../models/RefreshToken';
import { User } from '../../models/User';
import type { AuthUser } from '../../middleware/authenticate';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { serializeUser } from '../../utils/serialize';

export async function createStaff(input: CreateStaffInput, actor: AuthUser): Promise<UserDTO> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new ApiError(409, 'DUPLICATE_RESOURCE', 'A user with this email already exists');
  }
  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, env.BCRYPT_COST),
    role: 'staff',
    permissions: input.permissions,
    status: 'active',
    createdBy: actor.id,
  });
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'user.created',
    entity: 'user',
    entityId: user.id,
    after: { fullName: user.fullName, email: user.email, permissions: user.permissions },
  });
  return serializeUser(user);
}

export async function listUsers(): Promise<UserDTO[]> {
  const users = await User.find().sort({ role: 1, createdAt: 1 });
  return users.map(serializeUser);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: AuthUser,
): Promise<UserDTO> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'owner' && input.permissions) {
    throw ApiError.badRequest('The owner account always has every permission');
  }

  const before = { fullName: user.fullName, permissions: [...user.permissions] };
  if (input.fullName !== undefined) user.fullName = input.fullName;
  if (input.permissions !== undefined) {
    user.permissions = input.permissions;
    // Permission change takes effect immediately: old access tokens go stale.
    user.tokenVersion += 1;
  }
  await user.save();

  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: input.permissions ? 'user.permissions_changed' : 'user.updated',
    entity: 'user',
    entityId: user.id,
    before,
    after: { fullName: user.fullName, permissions: [...user.permissions] },
  });
  return serializeUser(user);
}

export async function setUserStatus(
  id: string,
  status: UserStatus,
  actor: AuthUser,
): Promise<UserDTO> {
  if (id === actor.id) throw ApiError.badRequest('You cannot deactivate your own account');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'owner') throw ApiError.badRequest('The owner account cannot be deactivated');

  const before = user.status;
  user.status = status;
  if (status === 'inactive') {
    user.tokenVersion += 1;
    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  await user.save();
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'user.status_changed',
    entity: 'user',
    entityId: user.id,
    before: { status: before },
    after: { status },
  });
  return serializeUser(user);
}

/** Owner resets a staff member's forgotten password (no email infra in Phase 1). */
export async function resetStaffPassword(
  id: string,
  newPassword: string,
  actor: AuthUser,
): Promise<void> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'owner') {
    throw ApiError.badRequest('Owner password is reset with the server CLI script, not the API');
  }
  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);
  user.tokenVersion += 1;
  await user.save();
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  writeAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    action: 'user.password_reset_by_owner',
    entity: 'user',
    entityId: user.id,
  });
}
