import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { buildSearchTokens } from '../../utils/search.js';

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    specialization: { type: String, required: true, trim: true, maxlength: 80 },
    hospital: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    /** Derived, lower-cased words used for indexed prefix search. Never sent to clients. */
    searchTokens: { type: [String], select: false, default: [] },
  },
  { timestamps: true },
);

/*
 * Indexes — each one exists to serve a specific query in doctor.service.ts.
 * Compound indexes follow the ESR rule (Equality, Sort, Range).
 */
doctorSchema.index({ email: 1 }, { unique: true }); // uniqueness + lookup
doctorSchema.index({ searchTokens: 1 }); // multikey index for prefix search
doctorSchema.index({ createdAt: -1, _id: -1 }); // default list sort + date filter
doctorSchema.index({ specialization: 1, createdAt: -1 }); // filter by specialization, newest first
doctorSchema.index({ hospital: 1, createdAt: -1 }); // filter by hospital, newest first
doctorSchema.index({ name: 1, _id: 1 }); // alphabetical sort

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
export type DoctorLean = DoctorAttrs & { _id: Types.ObjectId };
export const Doctor = model('Doctor', doctorSchema);
