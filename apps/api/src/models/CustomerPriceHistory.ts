import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** One document per price change (and one on customer creation), with
 *  effective dates. Informational: orders snapshot their own price. */
const customerPriceHistorySchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    breakfastPrice: { type: Number, default: 0, min: 0 },
    lunchPrice: { type: Number, required: true, min: 0 },
    dinnerPrice: { type: Number, required: true, min: 0 },
    prevBreakfastPrice: { type: Number, default: null },
    prevLunchPrice: { type: Number, default: null },
    prevDinnerPrice: { type: Number, default: null },
    effectiveDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kolkata)
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

customerPriceHistorySchema.index({ customerId: 1, effectiveDate: -1, createdAt: -1 });

export type CustomerPriceHistoryDoc = HydratedDocument<
  InferSchemaType<typeof customerPriceHistorySchema>
>;
export const CustomerPriceHistory = model('CustomerPriceHistory', customerPriceHistorySchema);
