import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema } from './auth.schema.js';

// Brute-force protection: 10 failed attempts per IP per 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => env.isTest,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in a few minutes.' } },
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validate(loginSchema), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);
