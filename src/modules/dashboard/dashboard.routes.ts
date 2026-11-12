import { Router, type Request, type Response } from 'express';
import { input, validate } from '../../middleware/validate.js';
import { dashboardStatsSchema } from './dashboard.schema.js';
import { getDashboardStats } from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', validate(dashboardStatsSchema), async (req: Request, res: Response) => {
  const { query } = input(req, dashboardStatsSchema);
  res.json({ data: await getDashboardStats(query.range) });
});
