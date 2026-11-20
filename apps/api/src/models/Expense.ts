import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** One expense line: a date can carry any number of items (the "kharcha book").
 *  Phase 2 can add category/supplier/inventory links without touching these fields. */
const expenseSchema = new Schema(
  {
    expenseDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kolkata)
    item: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '', trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, required: true },
  },
  { timestamps: true },
);

expenseSchema.index({ expenseDate: -1, createdAt: -1 });

export type ExpenseDoc = HydratedDocument<InferSchemaType<typeof expenseSchema>>;
export const Expense = model('Expense', expenseSchema);
