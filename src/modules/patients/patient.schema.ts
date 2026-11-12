import { z } from 'zod';
import { startOfUtcDay } from '../../utils/dates.js';
import { dateInput, emptyToUndefined, idParams, objectId, paginationQuery, phone } from '../../utils/validation.js';
import { GENDERS, PATIENT_CONDITIONS } from './patient.constants.js';

const admissionDate = dateInput
  .refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, { message: 'Admission date cannot be in the future' })
  .transform(startOfUtcDay);

const patientFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  age: z.coerce.number().int('Age must be a whole number').min(0).max(130),
  gender: z.enum(GENDERS, { error: 'Select a gender' }),
  phone,
  email: z.preprocess(emptyToUndefined, z.email('Enter a valid email address').trim().toLowerCase().max(160).optional()),
  diagnosis: z.string().trim().min(2, 'Diagnosis is required').max(160),
  condition: z.enum(PATIENT_CONDITIONS, { error: 'Select a condition' }),
  admissionDate,
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(1000).optional()),
};

/** Body for POST /doctors/:id/patients — the doctor comes from the URL. */
export const patientBodyWithoutDoctor = z.object(patientFields);
export type PatientInput = z.output<typeof patientBodyWithoutDoctor>;

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.split(',') : v), z.array(z.enum(values)).max(values.length));

export const PATIENT_SORTS = ['admission_desc', 'admission_asc', 'name_asc', 'name_desc', 'age_asc', 'age_desc'] as const;

export const patientListQuery = z
  .object({
    ...paginationQuery,
    q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    condition: z.preprocess(emptyToUndefined, csvEnum(PATIENT_CONDITIONS).optional()),
    gender: z.preprocess(emptyToUndefined, z.enum(GENDERS).optional()),
    doctor: z.preprocess(emptyToUndefined, objectId.optional()),
    from: z.preprocess(emptyToUndefined, dateInput.optional()),
    to: z.preprocess(emptyToUndefined, dateInput.optional()),
    minAge: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(130).optional()),
    maxAge: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(130).optional()),
    sort: z.preprocess(emptyToUndefined, z.enum(PATIENT_SORTS).default('admission_desc')),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must be before "to"', path: ['from'] })
  .refine((q) => q.minAge === undefined || q.maxAge === undefined || q.minAge <= q.maxAge, {
    message: 'Minimum age must be less than maximum age',
    path: ['minAge'],
  });
export type PatientListQuery = z.output<typeof patientListQuery>;

export const listPatientsSchema = { query: patientListQuery };

export const createPatientSchema = {
  body: z.object({ ...patientFields, doctor: objectId }),
};

export const updatePatientSchema = {
  params: idParams,
  body: z
    .object({ ...patientFields, doctor: objectId })
    .partial()
    .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
};
export type UpdatePatientInput = z.output<typeof updatePatientSchema.body>;

export const patientIdSchema = { params: idParams };
