/**
 * Owner password recovery — Phase 1 has no email infrastructure, so the owner
 * account's recovery boundary is server access:
 *
 *   NEW_PASSWORD='StrongPass123' pnpm --filter @tiffino/api reset-owner-password
 *
 * Bumps tokenVersion and revokes all refresh tokens, so every session dies.
 */
import bcrypt from 'bcryptjs';
import { passwordSchema } from '@tiffino/shared';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { RefreshToken } from '../models/RefreshToken';
import { User } from '../models/User';

async function main(): Promise<void> {
  const newPassword = process.env.NEW_PASSWORD;
  if (!newPassword) {
    console.error("Usage: NEW_PASSWORD='StrongPass123' pnpm --filter @tiffino/api reset-owner-password");
    process.exit(1);
  }
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    console.error(`Rejected: ${parsed.error.issues[0]?.message}`);
    process.exit(1);
  }

  await connectDb();
  const owner = await User.findOne({ role: 'owner' });
  if (!owner) {
    console.error('No owner account exists — run the seed script first.');
    process.exit(1);
  }

  owner.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);
  owner.tokenVersion += 1;
  await owner.save();
  await RefreshToken.updateMany(
    { userId: owner._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  console.log(`Password reset for owner ${owner.email}. All sessions revoked.`);
  await disconnectDb();
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
