import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Unique index violations: the Order slot index surfaces here on races.
  if (err instanceof MongoServerError && err.code === 11000) {
    const keys = Object.keys((err.keyPattern as Record<string, unknown>) ?? {});
    const isBookingSlot = keys.includes('orderDate') && keys.includes('mealType');
    res.status(409).json({
      success: false,
      error: isBookingSlot
        ? {
            code: 'DUPLICATE_BOOKING',
            message: 'This meal is already booked for this customer on this date',
          }
        : { code: 'DUPLICATE_RESOURCE', message: 'A record with this value already exists' },
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: err.message },
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid id format' },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProd ? 'Something went wrong' : String(err instanceof Error ? err.message : err),
    },
  });
}
