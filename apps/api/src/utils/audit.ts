import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';

export interface AuditEntry {
  actorId?: string | Types.ObjectId | null;
  actorName?: string;
  action: string;
  entity: 'auth' | 'user' | 'customer' | 'order' | 'payment';
  entityId?: string | Types.ObjectId | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
}

/** Fire-and-forget: an audit failure must never fail the business operation. */
export function writeAudit(entry: AuditEntry): void {
  AuditLog.create({
    actorId: entry.actorId ?? null,
    actorName: entry.actorName ?? '',
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    meta: entry.meta ?? null,
  }).catch((err) => {
    console.error('audit write failed:', err instanceof Error ? err.message : err);
  });
}
