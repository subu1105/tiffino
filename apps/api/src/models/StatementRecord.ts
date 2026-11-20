import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** One row per generated customer statement — an immutable snapshot of what
 *  was billed and what was pending at that moment. Later payments are compared
 *  against this to see whether the statement got settled. */
const statementRecordSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerNameSnapshot: { type: String, required: true },
    periodLabel: { type: String, required: true },
    from: { type: String, default: null }, // YYYY-MM-DD or null = beginning
    to: { type: String, default: null }, // YYYY-MM-DD or null = till now
    totalTiffins: { type: Number, required: true },
    breakfastCount: { type: Number, default: 0 },
    lunchCount: { type: Number, required: true },
    dinnerCount: { type: Number, required: true },
    periodAmount: { type: Number, required: true },
    totalBilled: { type: Number, required: true },
    totalPaid: { type: Number, required: true },
    pending: { type: Number, required: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    generatedByName: { type: String, required: true },
  },
  { timestamps: true },
);

statementRecordSchema.index({ customerId: 1, createdAt: -1 });

export type StatementRecordDoc = HydratedDocument<InferSchemaType<typeof statementRecordSchema>>;
export const StatementRecord = model('StatementRecord', statementRecordSchema);
