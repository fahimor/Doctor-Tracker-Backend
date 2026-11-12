import { z } from 'zod';

export const DASHBOARD_RANGES = ['7d', '30d', '90d', '12m'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const dashboardStatsSchema = {
  query: z.object({
    range: z.enum(DASHBOARD_RANGES).default('30d'),
  }),
};
