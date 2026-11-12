import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { doctorRouter } from './modules/doctors/doctor.routes.js';
import { patientRouter } from './modules/patients/patient.routes.js';

export function createApp() {
  const app = express();

  // Cloud Run (and optionally Vercel) sit in front of us; trust their
  // X-Forwarded-* headers so req.ip / req.secure are correct.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / server-to-server requests have no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      // One compact line per request instead of full header dumps.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customSuccessMessage: (req, res, time) => `${req.method} ${req.url} ${res.statusCode} ${Math.round(time)}ms`,
      customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  app.get('/', (_req, res) => {
    res.json({ name: 'Doctor Tracker API', status: 'ok', health: '/health', docs: 'See README.md for endpoints' });
  });

  // Liveness / readiness probe for Cloud Run and uptime checks.
  // (Cloud Run reserves paths ending in "z", so this is /health, not /healthz.)
  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
  });

  const api = Router();

  // A generous global limit that stops runaway clients / scrapers.
  api.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      skip: () => env.isTest,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
    }),
  );

  api.use('/auth', authRouter);

  // Everything below this line requires a valid session.
  api.use(requireAuth);
  api.use('/dashboard', dashboardRouter);
  api.use('/doctors', doctorRouter);
  api.use('/patients', patientRouter);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
