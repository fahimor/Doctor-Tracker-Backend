import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { buildSearchTokens } from '../../utils/search.js';
import { GENDERS, PATIENT_CONDITIONS } from './patient.constants.js';

const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, enum: GENDERS, required: true },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    diagnosis: { type: String, required: true, trim: true, maxlength: 160 },
    condition: { type: String, enum: PATIENT_CONDITIONS, required: true, default: 'stable' },
    /** Stored as UTC midnight (date-only), which keeps date bucketing exact. */
    admissionDate: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    searchTokens: { type: [String], select: false, default: [] },
  },
  { timestamps: true },
);

/*
 * Indexes — each one exists to serve a specific query in patient.service.ts
 * or dashboard.service.ts. Compound indexes follow ESR (Equality, Sort, Range).
 */
patientSchema.index({ doctor: 1, admissionDate: -1 }); // a doctor's patients + "patients per doctor" $group
patientSchema.index({ condition: 1, admissionDate: -1 }); // condition filter, newest admissions first
patientSchema.index({ admissionDate: -1, _id: -1 }); // default sort + date range + dashboard trend
patientSchema.index({ searchTokens: 1 }); // multikey index for prefix search
patientSchema.index({ name: 1, _id: 1 }); // alphabetical sort

type SearchablePatient = { name: string; email?: string | null; phone: string; diagnosis: string };

export function patientSearchTokens(p: SearchablePatient): string[] {
  return buildSearchTokens(p.name, p.email, p.phone, p.diagnosis);
}

patientSchema.pre('save', function () {
  if (this.isNew || this.isModified(['name', 'email', 'phone', 'diagnosis'])) {
    this.searchTokens = patientSearchTokens(this);
  }
});

export type PatientAttrs = InferSchemaType<typeof patientSchema>;
export type PatientLean = PatientAttrs & { _id: Types.ObjectId };
export const Patient = model('Patient', patientSchema);
