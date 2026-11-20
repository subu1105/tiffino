import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiters';
import { apiRouter } from './routes';

export function buildApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  // gzip JSON responses — big payloads (customer lists, reports) shrink ~5-10x
  // on the phone's network.
  app.use(compression());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Request log: one line per request with status + duration. Error responses
  // include the error code so failures are diagnosable straight from the terminal.
  if (!env.isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`;
        if (res.statusCode >= 500) console.error(line);
        else if (res.statusCode >= 400) console.warn(line);
        else console.log(line);
      });
      next();
    });
  }

  app.use(apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', service: 'tiffino-api' } });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
