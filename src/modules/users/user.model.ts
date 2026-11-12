import { Schema, model, type InferSchemaType } from 'mongoose';
import { ROLES } from '../auth/auth.types.js';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 160 },
    // Never returned unless explicitly selected with `.select('+passwordHash')`.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'admin', required: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
