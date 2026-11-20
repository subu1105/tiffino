import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const skip = () => env.isTest;

/** Brute-force protection on credential endpoints: 10 attempts / 15 min / IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in 15 minutes' },
    });
  },
});

/** General API ceiling to blunt abuse without bothering real use. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' },
    });
  },
});
