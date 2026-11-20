import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PAYMENT_METHODS } from '@tiffino/shared';

const paymentSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    amount: { type: Number, required: true, min: 1 },
    paymentDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kolkata)
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    notes: { type: String, default: '', trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Optional settlement link: this payment pays off one specific statement. */
    statementId: { type: Schema.Types.ObjectId, ref: 'StatementRecord', default: null },
    statementPeriodLabel: { type: String, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ customerId: 1, paymentDate: -1 });
paymentSchema.index({ paymentDate: 1 });
paymentSchema.index({ createdAt: -1 });

export type PaymentDoc = HydratedDocument<InferSchemaType<typeof paymentSchema>>;
export const Payment = model('Payment', paymentSchema);
