import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    action: { type: String, required: true }, // e.g. 'order.booked', 'customer.price_changed'
    entity: { type: String, required: true }, // 'user' | 'customer' | 'order' | 'payment' | 'auth'
    entityId: { type: Schema.Types.ObjectId, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export type AuditLogDoc = HydratedDocument<InferSchemaType<typeof auditLogSchema>>;
export const AuditLog = model('AuditLog', auditLogSchema);
