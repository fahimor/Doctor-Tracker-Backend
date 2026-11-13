import { Schema, model, type InferSchemaType } from 'mongoose';
import { buildSearchTokens } from '../../utils/search.js';

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    specialization: { type: String, required: true, trim: true, maxlength: 80 },
    hospital: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    /**
     * Denormalised number of patients assigned to this doctor. Kept in sync
     * atomically ($inc) by patient.service on every patient create, delete and
     * reassignment, so lists can sort by caseload from an index instead of
     * counting patients on every request. Never accepted from clients.
     * `npm run db:recount` rebuilds it from the patients collection.
     */
    patientCount: { type: Number, default: 0, min: 0 },
    /** Derived, lower-cased words used for indexed prefix search. Never sent to clients. */
    searchTokens: { type: [String], select: false, default: [] },
  },
  { timestamps: true },
);

/*
 * Indexes — each one exists to serve a specific query in doctor.service.ts.
 * Compound indexes follow the ESR rule (Equality, Sort, Range) and end with
 * `_id`, because every list sort uses `_id` as its tie-breaker. Without it,
 * MongoDB has to read every match and sort them in memory before paging.
 */
doctorSchema.index({ email: 1 }, { unique: true }); // uniqueness + lookup
doctorSchema.index({ searchTokens: 1 }); // multikey index for prefix search
doctorSchema.index({ createdAt: -1, _id: -1 }); // default list sort + date filter
doctorSchema.index({ specialization: 1, createdAt: -1, _id: -1 }); // filter by specialization, newest first
doctorSchema.index({ hospital: 1, createdAt: -1, _id: -1 }); // filter by hospital, newest first
doctorSchema.index({ name: 1, _id: 1 }); // A–Z and (scanned backwards) Z–A sort
doctorSchema.index({ patientCount: -1, _id: -1 }); // most / fewest patients, dashboard top caseloads

type SearchableDoctor = Pick<DoctorAttrs, 'name' | 'specialization' | 'hospital' | 'email' | 'phone'>;

export function doctorSearchTokens(d: SearchableDoctor): string[] {
  return buildSearchTokens(d.name, d.specialization, d.hospital, d.email, d.phone);
}

doctorSchema.pre('save', function () {
  if (this.isNew || this.isModified(['name', 'specialization', 'hospital', 'email', 'phone'])) {
    this.searchTokens = doctorSearchTokens(this);
  }
});

export type DoctorAttrs = InferSchemaType<typeof doctorSchema>;
export const Doctor = model('Doctor', doctorSchema);
