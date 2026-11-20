import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from '@tiffino/shared';

const customerSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true, unique: true },
    address: { type: String, default: '', trim: true },
    type: { type: String, enum: CUSTOMER_TYPES, required: true },
    /** Current prices; every change is also recorded in CustomerPriceHistory.
     *  Orders snapshot the price at booking time, so edits never touch history. */
    breakfastPrice: { type: Number, default: 0, min: 0 },
    lunchPrice: { type: Number, required: true, min: 0 },
    dinnerPrice: { type: Number, required: true, min: 0 },
    joiningDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kolkata)
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'active' },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

customerSchema.index({ type: 1, status: 1 });
customerSchema.index({ fullName: 1 });
customerSchema.index({ createdAt: -1 });

export type CustomerDoc = HydratedDocument<InferSchemaType<typeof customerSchema>>;
export const Customer = model('Customer', customerSchema);
