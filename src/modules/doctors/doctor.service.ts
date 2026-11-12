import { Types } from 'mongoose';
import { ApiError } from '../../utils/api-error.js';
import { buildDateRange } from '../../utils/dates.js';
import { buildPageMeta, toSkip } from '../../utils/pagination.js';
import { buildSearchFilter } from '../../utils/search.js';
import { Patient } from '../patients/patient.model.js';
import { Doctor } from './doctor.model.js';
import type { CreateDoctorInput, DOCTOR_SORTS, ListDoctorsQuery, UpdateDoctorInput } from './doctor.schema.js';

type SortSpec = Record<string, 1 | -1>;

const SORTS: Record<(typeof DOCTOR_SORTS)[number], SortSpec> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: -1 },
};

function buildDoctorFilter(q: ListDoctorsQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...buildSearchFilter(q.q) };

  if (q.specialization?.length) {
    filter.specialization = q.specialization.length === 1 ? q.specialization[0] : { $in: q.specialization };
  }
  if (q.hospital?.length) {
    filter.hospital = q.hospital.length === 1 ? q.hospital[0] : { $in: q.hospital };
  }
  const joined = buildDateRange(q.from, q.to);
  if (joined) filter.createdAt = joined;

  return filter;
}

/**
 * Patient counts for a page of doctors in ONE aggregation (no N+1 queries).
 * `$match` on `doctor` uses the `{ doctor: 1, admissionDate: -1 }` index.
 */
async function patientCountsFor(doctorIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (doctorIds.length === 0) return new Map();
  const rows = await Patient.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { doctor: { $in: doctorIds } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export async function listDoctors(q: ListDoctorsQuery) {
  const filter = buildDoctorFilter(q);
  const unfiltered = Object.keys(filter).length === 0;

  const [items, total] = await Promise.all([
    Doctor.find(filter).sort(SORTS[q.sort]).skip(toSkip(q)).limit(q.limit).select('-__v').lean(),
    unfiltered ? Doctor.estimatedDocumentCount() : Doctor.countDocuments(filter),
  ]);

  const counts = await patientCountsFor(items.map((d) => d._id));
  const data = items.map((d) => ({ ...d, patientCount: counts.get(String(d._id)) ?? 0 }));

  return { data, meta: buildPageMeta(q, total) };
}

/** Distinct values for the filter dropdowns (served straight from the indexes). */
export async function getDoctorFacets() {
  const [specializations, hospitals] = (await Promise.all([
    Doctor.distinct('specialization'),
    Doctor.distinct('hospital'),
  ])) as [string[], string[]];
  const byName = (a: string, b: string) => a.localeCompare(b);
  return { specializations: specializations.sort(byName), hospitals: hospitals.sort(byName) };
}

/** Lightweight, searchable list for "pick a doctor" inputs. */
export async function getDoctorOptions(q: string | undefined, limit: number) {
  return Doctor.find(buildSearchFilter(q))
    .sort({ name: 1, _id: 1 })
    .limit(limit)
    .select('name specialization hospital')
    .lean();
}

export async function getDoctor(id: string) {
  const doctorId = new Types.ObjectId(id);
  const [doctor, byCondition] = await Promise.all([
    Doctor.findById(doctorId).select('-__v').lean(),
    Patient.aggregate<{ _id: string; count: number; lastAdmission: Date }>([
      { $match: { doctor: doctorId } },
      { $group: { _id: '$condition', count: { $sum: 1 }, lastAdmission: { $max: '$admissionDate' } } },
    ]),
  ]);
  if (!doctor) throw ApiError.notFound('Doctor');

  const stats = {
    totalPatients: byCondition.reduce((sum, r) => sum + r.count, 0),
    byCondition: Object.fromEntries(byCondition.map((r) => [r._id, r.count])),
    lastAdmission:
      byCondition.reduce<Date | null>((max, r) => (!max || r.lastAdmission > max ? r.lastAdmission : max), null),
  };
  return { ...doctor, stats };
}

export async function createDoctor(input: CreateDoctorInput) {
  const doctor = await Doctor.create(input);
  return getDoctor(String(doctor._id));
}

export async function updateDoctor(id: string, input: UpdateDoctorInput) {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw ApiError.notFound('Doctor');
  doctor.set(input);
  await doctor.save(); // refreshes searchTokens via the pre-save hook
  return getDoctor(id);
}

/**
 * Deleting a doctor also removes their patients. Patients are removed first so
 * that a partial failure never leaves patients pointing at a missing doctor.
 */
export async function deleteDoctor(id: string) {
  const exists = await Doctor.exists({ _id: id });
  if (!exists) throw ApiError.notFound('Doctor');
  const { deletedCount: deletedPatients } = await Patient.deleteMany({ doctor: id });
  await Doctor.deleteOne({ _id: id });
  return { deletedPatients };
}
