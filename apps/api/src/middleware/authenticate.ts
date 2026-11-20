import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Permission, Role } from '@tiffino/shared';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/jwt';

export interface AuthUser {
  id: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
  tokenVersion: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Authentication required');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Session expired, please refresh', 'AUTH_TOKEN_EXPIRED');
      }
      throw ApiError.unauthorized('Invalid access token');
    }

    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw ApiError.unauthorized('Account is not active');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw ApiError.unauthorized('Session is no longer valid, please log in again', 'AUTH_TOKEN_STALE');
    }

    req.user = {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      permissions: user.permissions as Permission[],
      tokenVersion: user.tokenVersion,
    };
    next();
  },
);
