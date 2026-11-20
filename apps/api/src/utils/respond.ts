import type { Response } from 'express';
import type { ApiMeta } from '@tiffino/shared';

/** The only way success leaves the API: { success: true, data, meta? }. */
export function ok<T>(res: Response, data: T, meta?: ApiMeta, status = 200): void {
  res.status(status).json(meta ? { success: true, data, meta } : { success: true, data });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, undefined, 201);
}

export function buildMeta(page: number, limit: number, total: number): ApiMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
