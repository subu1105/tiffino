import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { COOK_ENTRY_KINDS } from '@tiffino/shared';

/** The cook ledger: money handed to the cook every few days, and the amounts
 *  they occasionally return. Net = paid − returned. Separate from the expense
 *  book on purpose — advances settle back and forth before becoming kharcha. */
const cookEntrySchema = new Schema(
  {
    entryDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kolkata)
    kind: { type: String, enum: COOK_ENTRY_KINDS, required: true },
    amount: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '', trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, required: true },
  },
  { timestamps: true },
);

cookEntrySchema.index({ entryDate: -1, createdAt: -1 });

export type CookEntryDoc = HydratedDocument<InferSchemaType<typeof cookEntrySchema>>;
export const CookEntry = model('CookEntry', cookEntrySchema);
