import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Permission } from '@tiffino/shared';
import { ApiError } from '../utils/ApiError';

/** Owner passes unconditionally; staff must hold the permission.
 *  This — not UI hiding — is the enforcement point. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());
    if (user.role === 'owner' || user.permissions.includes(permission)) return next();
    next(ApiError.forbidden('You do not have permission to do this', { required: permission }));
  };
}

export const requireOwner: RequestHandler = (req, _res, next) => {
  const user = req.user;
  if (!user) return next(ApiError.unauthorized());
  if (user.role !== 'owner') return next(ApiError.forbidden('Owner access required'));
  next();
};
