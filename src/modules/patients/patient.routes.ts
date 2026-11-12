import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as c from './patient.controller.js';
import { createPatientSchema, listPatientsSchema, patientIdSchema, updatePatientSchema } from './patient.schema.js';

/** Mounted behind `requireAuth`. Writes additionally require the admin role. */
export const patientRouter = Router();
const adminOnly = requireRole('admin');

patientRouter.get('/', validate(listPatientsSchema), c.list);
patientRouter.post('/', adminOnly, validate(createPatientSchema), c.create);
patientRouter.get('/:id', validate(patientIdSchema), c.getOne);
patientRouter.patch('/:id', adminOnly, validate(updatePatientSchema), c.update);
patientRouter.delete('/:id', adminOnly, validate(patientIdSchema), c.remove);
