import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import * as c from './dashboard.controller.js';
import { dashboardStatsSchema } from './dashboard.schema.js';

/** Mounted behind `requireAuth`. Read-only, so every role may use it. */
export const dashboardRouter = Router();

dashboardRouter.get('/stats', validate(dashboardStatsSchema), c.stats);
