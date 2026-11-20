import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ApiError } from '../utils/ApiError';

interface ValidateSpec {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Parses and REPLACES req.body/query/params with the Zod output, so handlers
 *  only ever see validated, typed, coerced data. */
export function validate(spec: ValidateSpec): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = spec[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const details = result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        return next(
          new ApiError(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid request', details),
        );
      }
      if (key === 'query') {
        // Express 5-safe: req.query is a getter; stash parsed output separately.
        (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
      } else {
        req[key] = result.data;
      }
    }
    next();
  };
}

/** Typed accessor for query values parsed by validate(). */
export function getQuery<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return ((req as Request & { validatedQuery?: unknown }).validatedQuery ?? req.query) as z.infer<T>;
}
