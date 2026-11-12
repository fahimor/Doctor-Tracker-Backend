import type { Types } from 'mongoose';
import { ApiError } from '../../utils/api-error.js';
import { buildDateRange } from '../../utils/dates.js';
import { buildPageMeta, toSkip } from '../../utils/pagination.js';
import { buildSearchFilter } from '../../utils/search.js';
import { Doctor } from '../doctors/doctor.model.js';
import { Patient } from './patient.model.js';
import type { PATIENT_SORTS, PatientInput, PatientListQuery, UpdatePatientInput } from './patient.schema.js';

type SortSpec = Record<string, 1 | -1>;

// `_id` is always the final tie-breaker so pagination is stable (no duplicates
// or skipped rows between pages when many records share the same sort value).
const SORTS: Record<(typeof PATIENT_SORTS)[number], SortSpec> = {
  admission_desc: { admissionDate: -1, _id: -1 },
  admission_asc: { admissionDate: 1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: -1 },
  age_asc: { age: 1, _id: 1 },
  age_desc: { age: -1, _id: -1 },
};

const DOCTOR_SUMMARY_FIELDS = 'name specialization hospital';

export interface DoctorSummary {
  _id: Types.ObjectId;
  name: string;
  specialization: string;
  hospital: string;
}

export function buildPatientFilter(q: Partial<PatientListQuery>): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...buildSearchFilter(q.q) };

  if (q.doctor) filter.doctor = q.doctor;
  if (q.condition?.length) filter.condition = q.condition.length === 1 ? q.condition[0] : { $in: q.condition };
  if (q.gender) filter.gender = q.gender;

  const admission = buildDateRange(q.from, q.to);
  if (admission) filter.admissionDate = admission;

  if (q.minAge !== undefined || q.maxAge !== undefined) {
    filter.age = {
      ...(q.minAge !== undefined ? { $gte: q.minAge } : {}),
      ...(q.maxAge !== undefined ? { $lte: q.maxAge } : {}),
    };
  }
  return filter;
}

export async function listPatients(q: PatientListQuery) {
  const filter = buildPatientFilter(q);
  const unfiltered = Object.keys(filter).length === 0;

  // The page query and the count run in parallel. With no filter we use the
  // collection metadata count, which is O(1) instead of scanning the index.
  const [items, total] = await Promise.all([
    Patient.find(filter)
      .sort(SORTS[q.sort])
      .skip(toSkip(q))
      .limit(q.limit)
      .select('-__v')
      .populate<{ doctor: DoctorSummary | null }>('doctor', DOCTOR_SUMMARY_FIELDS)
      .lean(),
    unfiltered ? Patient.estimatedDocumentCount() : Patient.countDocuments(filter),
  ]);

  return { data: items, meta: buildPageMeta(q, total) };
}

export async function getPatient(id: string) {
  const patient = await Patient.findById(id)
    .select('-__v')
    .populate<{ doctor: DoctorSummary | null }>('doctor', DOCTOR_SUMMARY_FIELDS)
    .lean();
  if (!patient) throw ApiError.notFound('Patient');
  return patient;
}

async function assertDoctorExists(doctorId: string) {
  const exists = await Doctor.exists({ _id: doctorId });
  if (!exists) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Selected doctor does not exist', [
      { path: 'doctor', message: 'Selected doctor does not exist' },
    ]);
  }
}

export async function createPatient(input: PatientInput & { doctor: string }) {
  await assertDoctorExists(input.doctor);
  const patient = await Patient.create(input);
  return getPatient(String(patient._id));
}

export async function updatePatient(id: string, input: UpdatePatientInput) {
  const patient = await Patient.findById(id);
  if (!patient) throw ApiError.notFound('Patient');

  if (input.doctor && String(patient.doctor) !== input.doctor) {
    await assertDoctorExists(input.doctor);
  }

  patient.set(input);
  await patient.save(); // runs the pre-save hook that refreshes searchTokens
  return getPatient(id);
}

/** When `doctorId` is given the patient must belong to that doctor. */
export async function deletePatient(id: string, doctorId?: string) {
  const { deletedCount } = await Patient.deleteOne({ _id: id, ...(doctorId ? { doctor: doctorId } : {}) });
  if (deletedCount === 0) throw ApiError.notFound('Patient');
}
