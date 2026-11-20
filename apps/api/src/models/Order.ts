import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { CUSTOMER_TYPES, MEAL_TYPES, ORDER_STATUSES } from '@tiffino/shared';

const orderSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kolkata)
    mealType: { type: String, enum: MEAL_TYPES, required: true },
    /** Immutable snapshots taken at booking time — later customer edits never touch them. */
    customerTypeSnapshot: { type: String, enum: CUSTOMER_TYPES, required: true },
    customerNameSnapshot: { type: String, required: true },
    /** price = unitPrice × quantity (the line TOTAL, so $sum stays correct). */
    price: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    priceOverridden: { type: Boolean, default: false },
    status: { type: String, enum: ORDER_STATUSES, default: 'booked' },
    /** true while booked/prepared/delivered; false once cancelled. Drives the
     *  partial unique index so a cancelled slot can be rebooked. */
    active: { type: Boolean, default: true },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

/** THE core business constraint: at most one ACTIVE order per
 *  (customer, business date, meal). Cancelled orders fall out of the index,
 *  which both preserves their history and frees the slot for rebooking.
 *  Duplicate inserts surface as E11000 and are mapped to 409 DUPLICATE_BOOKING. */
orderSchema.index(
  { customerId: 1, orderDate: 1, mealType: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

orderSchema.index({ orderDate: 1, mealType: 1, active: 1 });
orderSchema.index({ customerId: 1, orderDate: -1 });
orderSchema.index({ createdAt: -1 });

export type OrderDoc = HydratedDocument<InferSchemaType<typeof orderSchema>>;
export const Order = model('Order', orderSchema);
