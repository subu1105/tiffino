import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PERMISSIONS, ROLES, USER_STATUSES } from '@tiffino/shared';

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    /** Bumped on password change / logout-all; stale access tokens are rejected. */
    tokenVersion: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
