import type { Request, Response } from 'express';
import { input } from '../../middleware/validate.js';
import { dashboardStatsSchema } from './dashboard.schema.js';
import { getDashboardStats } from './dashboard.service.js';

export async function stats(req: Request, res: Response) {
  const { query } = input(req, dashboardStatsSchema);
  res.json({ data: await getDashboardStats(query.range) });
}
