import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { COOK_ATTENDANCE_STATUSES } from '@tiffino/shared';

/** One row per calendar day: did the cook work or take leave? Worked days
 *  carry a wage snapshot that flows straight into profit & loss. */
const cookAttendanceSchema = new Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD, one mark per day
    status: { type: String, enum: COOK_ATTENDANCE_STATUSES, required: true },
    dailyRate: { type: Number, default: 0, min: 0 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, required: true },
  },
  { timestamps: true },
);

export type CookAttendanceDoc = HydratedDocument<InferSchemaType<typeof cookAttendanceSchema>>;
export const CookAttendance = model('CookAttendance', cookAttendanceSchema);
