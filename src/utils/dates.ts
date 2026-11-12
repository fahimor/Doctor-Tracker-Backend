/**
 * Inclusive date range filter for a Date field. `to` is extended to the end
 * of that UTC day so "2026-01-31" includes everything on the 31st.
 */
export function buildDateRange(from?: Date, to?: Date): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const range: Record<string, Date> = {};
  if (from) range.$gte = startOfUtcDay(from);
  if (to) {
    const end = startOfUtcDay(to);
    end.setUTCDate(end.getUTCDate() + 1);
    range.$lt = end;
  }
  return range;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
