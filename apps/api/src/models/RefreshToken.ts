import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Refresh tokens are stored only as SHA-256 hashes. Rotation marks the old
 *  document revoked; presenting an already-revoked token revokes the whole
 *  family (stolen-token assumption). */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true },
    deviceLabel: { type: String, default: 'unknown' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ familyId: 1 });
// MongoDB TTL reaper removes expired documents automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDoc = HydratedDocument<InferSchemaType<typeof refreshTokenSchema>>;
export const RefreshToken = model('RefreshToken', refreshTokenSchema);
