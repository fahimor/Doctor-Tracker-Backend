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
  // Both directions are served by the { patientCount: -1, _id: -1 } index.
  patients_desc: { patientCount: -1, _id: -1 },
  patients_asc: { patientCount: 1, _id: 1 },
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

export async function listDoctors(q: ListDoctorsQuery) {
  const filter = buildDoctorFilter(q);
  const unfiltered = Object.keys(filter).length === 0;

  const [items, total] = await Promise.all([
    Doctor.find(filter).sort(SORTS[q.sort]).skip(toSkip(q)).limit(q.limit).select('-__v').lean(),
    unfiltered ? Doctor.estimatedDocumentCount() : Doctor.countDocuments(filter),
  ]);

  // patientCount is stored on the doctor, so the page needs no extra query.
  const data = items.map((d) => ({ ...d, patientCount: d.patientCount ?? 0 }));

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

/**
 * Rebuilds every doctor's `patientCount` from the patients collection.
 * The counter is maintained atomically on each write, so this is only for
 * repairs (e.g. after manual edits in the database) and for seeding.
 */
export async function recountPatientCounts(): Promise<{ doctorsUpdated: number }> {
  const [rows, doctors] = await Promise.all([
    Patient.aggregate<{ _id: Types.ObjectId; count: number }>([{ $group: { _id: '$doctor', count: { $sum: 1 } } }]),
    Doctor.find({}, { patientCount: 1 }).lean(),
  ]);
  const actual = new Map(rows.map((r) => [String(r._id), r.count]));

  // Write only the doctors whose stored count is wrong.
  const fixes = doctors
    .map((d) => ({ id: d._id, count: actual.get(String(d._id)) ?? 0, stored: d.patientCount ?? 0 }))
    .filter((d) => d.count !== d.stored);

  if (fixes.length) {
    await Doctor.bulkWrite(fixes.map((f) => ({ updateOne: { filter: { _id: f.id }, update: { $set: { patientCount: f.count } } } })));
  }
  return { doctorsUpdated: fixes.length };
}
