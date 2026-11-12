import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const objectId = z
  .string()
  .trim()
  .refine((v) => isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), { message: 'Invalid id' });

export const idParams = z.object({ id: objectId });

/** "YYYY-MM-DD" or full ISO string -> Date. */
export const dateInput = z.coerce.date({ error: 'Invalid date' });

/** Accepts empty strings from query strings / forms as "not provided". */
export const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const paginationQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};

export const phone = z
  .string()
  .trim()
  .min(6, 'Phone number is too short')
  .max(20, 'Phone number is too long')
  .regex(/^\+?[\d\s()-]+$/, 'Phone number can only contain digits, spaces, +, -, ( )');
