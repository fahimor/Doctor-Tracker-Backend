import { Doctor } from '../doctors/doctor.model.js';
import { Patient } from '../patients/patient.model.js';
import { startOfUtcDay } from '../../utils/dates.js';
import type { DashboardRange } from './dashboard.schema.js';

type Unit = 'day' | 'week' | 'month';

interface Period {
  from: Date; // inclusive
  to: Date; // exclusive (start of tomorrow, UTC)
  prevFrom: Date; // previous period of equal length, for trend deltas
  unit: Unit;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addUnit(date: Date, unit: Unit, n = 1): Date {
  const d = new Date(date);
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/** Same alignment MongoDB's `$dateTrunc` uses (weeks start on Monday). */
function truncate(date: Date, unit: Unit): Date {
  const d = startOfUtcDay(date);
  if (unit === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (unit === 'month') d.setUTCDate(1);
  return d;
}

export function resolvePeriod(range: DashboardRange, now = new Date()): Period {
  const to = addUnit(startOfUtcDay(now), 'day');
  let from: Date;
  let unit: Unit;

  switch (range) {
    case '7d':
      unit = 'day';
      from = addUnit(to, 'day', -7);
      break;
    case '30d':
      unit = 'day';
      from = addUnit(to, 'day', -30);
      break;
    case '90d':
      unit = 'week';
      from = truncate(addUnit(to, 'day', -90), 'week');
      break;
    case '12m':
      unit = 'month';
      from = addUnit(truncate(now, 'month'), 'month', -11);
      break;
  }

  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  return { from, to, prevFrom, unit };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "new", no baseline
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const AGE_BOUNDARIES = [0, 18, 31, 46, 61, 131];
const AGE_LABELS: Record<number, string> = { 0: '0–17', 18: '18–30', 31: '31–45', 46: '46–60', 61: '60+' };

/**
 * Every widget on the dashboard comes from this one call. Independent queries
 * run in parallel, the three patient breakdowns share a single `$facet` so the
 * patients collection is read once, and the top caseloads come from an index.
 */
export async function getDashboardStats(range: DashboardRange) {
  const { from, to, prevFrom, unit } = resolvePeriod(range);

  const [
    totalDoctors,
    totalPatients,
    newPatients,
    prevNewPatients,
    newDoctors,
    trendRows,
    [breakdowns],
    topDoctors,
    specializations,
  ] = await Promise.all([
    Doctor.estimatedDocumentCount(),
    Patient.estimatedDocumentCount(),
    Patient.countDocuments({ admissionDate: { $gte: from, $lt: to } }),
    Patient.countDocuments({ admissionDate: { $gte: prevFrom, $lt: from } }),
    Doctor.countDocuments({ createdAt: { $gte: from, $lt: to } }),

    // Admissions over time — `$match` uses the { admissionDate: -1 } index.
    Patient.aggregate<{ _id: Date; total: number; critical: number }>([
      { $match: { admissionDate: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: {
            $dateTrunc: { date: '$admissionDate', unit, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) },
          },
          total: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$condition', 'critical'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Patient.aggregate<{
      byCondition: { _id: string; count: number }[];
      byGender: { _id: string; count: number }[];
      byAge: { _id: number; count: number }[];
    }>([
      { $project: { condition: 1, gender: 1, age: 1 } },
      {
        $facet: {
          byCondition: [{ $group: { _id: '$condition', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byGender: [{ $group: { _id: '$gender', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byAge: [{ $bucket: { groupBy: '$age', boundaries: AGE_BOUNDARIES, default: 'unknown', output: { count: { $sum: 1 } } } }],
        },
      },
    ]),

    // Heaviest caseloads: read the top 10 straight off the { patientCount: -1, _id: -1 }
    // index instead of grouping the whole patients collection.
    Doctor.find({ patientCount: { $gt: 0 } })
      .sort({ patientCount: -1, _id: -1 })
      .limit(10)
      .select('name specialization patientCount')
      .lean(),

    Doctor.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$specialization', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
  ]);

  // Fill empty buckets so charts show a continuous timeline.
  const byBucket = new Map(trendRows.map((r) => [r._id.getTime(), r]));
  const admissionsTrend: { date: string; total: number; critical: number }[] = [];
  for (let cursor = truncate(from, unit); cursor < to; cursor = addUnit(cursor, unit)) {
    const row = byBucket.get(cursor.getTime());
    admissionsTrend.push({
      date: cursor.toISOString().slice(0, 10),
      total: row?.total ?? 0,
      critical: row?.critical ?? 0,
    });
  }

  const byCondition = breakdowns?.byCondition ?? [];
  const criticalPatients = byCondition.find((c) => c._id === 'critical')?.count ?? 0;

  return {
    range,
    period: { from: from.toISOString(), to: new Date(to.getTime() - DAY_MS).toISOString(), unit },
    totals: {
      doctors: totalDoctors,
      patients: totalPatients,
      criticalPatients,
      avgPatientsPerDoctor: totalDoctors ? Math.round((totalPatients / totalDoctors) * 10) / 10 : 0,
      newPatients,
      newPatientsChange: percentChange(newPatients, prevNewPatients),
      newDoctors,
    },
    admissionsTrend,
    patientsByCondition: byCondition.map((c) => ({ condition: c._id, count: c.count })),
    patientsByGender: (breakdowns?.byGender ?? []).map((g) => ({ gender: g._id, count: g.count })),
    patientsByAge: (breakdowns?.byAge ?? [])
      .filter((b) => typeof b._id === 'number')
      .map((b) => ({ bucket: AGE_LABELS[b._id] ?? String(b._id), count: b.count })),
    patientsPerDoctor: topDoctors.map((d) => ({
      doctorId: String(d._id),
      name: d.name,
      specialization: d.specialization,
      count: d.patientCount ?? 0,
    })),
    doctorsBySpecialization: specializations.map((s) => ({ specialization: s._id, count: s.count })),
  };
}
