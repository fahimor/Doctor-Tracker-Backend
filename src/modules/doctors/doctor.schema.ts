import { z } from 'zod';
import { dateInput, emptyToUndefined, idParams, objectId, paginationQuery, phone } from '../../utils/validation.js';

const doctorBody = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  specialization: z.string().trim().min(2, 'Specialization is required').max(80),
  hospital: z.string().trim().min(2, 'Hospital is required').max(160),
  phone,
  email: z.email('Enter a valid email address').trim().toLowerCase().max(160),
});

/** "a,b" or ["a","b"] -> ["a","b"] */
const csvList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',') : v),
  z.array(z.string().trim().min(1).max(160)).max(20),
);

export const DOCTOR_SORTS = ['newest', 'oldest', 'name_asc', 'name_desc'] as const;

export const listDoctorsSchema = {
  query: z
    .object({
      ...paginationQuery,
      q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
      specialization: z.preprocess(emptyToUndefined, csvList.optional()),
      hospital: z.preprocess(emptyToUndefined, csvList.optional()),
      from: z.preprocess(emptyToUndefined, dateInput.optional()),
      to: z.preprocess(emptyToUndefined, dateInput.optional()),
      sort: z.preprocess(emptyToUndefined, z.enum(DOCTOR_SORTS).default('newest')),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must be before "to"', path: ['from'] }),
};
export type ListDoctorsQuery = z.output<typeof listDoctorsSchema.query>;

export const doctorOptionsSchema = {
  query: z.object({
    q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
};

export const createDoctorSchema = { body: doctorBody };
export type CreateDoctorInput = z.output<typeof doctorBody>;

export const updateDoctorSchema = {
  params: idParams,
  body: doctorBody.partial().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
};
export type UpdateDoctorInput = z.output<typeof updateDoctorSchema.body>;

export const doctorIdSchema = { params: idParams };

export const doctorPatientParams = {
  params: z.object({ id: objectId, patientId: objectId }),
};
