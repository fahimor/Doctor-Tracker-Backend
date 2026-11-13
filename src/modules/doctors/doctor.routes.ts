import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as c from './doctor.controller.js';
import {
  addPatientSchema,
  createDoctorSchema,
  doctorIdSchema,
  doctorOptionsSchema,
  doctorPatientParams,
  listDoctorsSchema,
  listPatientsOfDoctorSchema,
  updateDoctorSchema,
} from './doctor.schema.js';

/** Mounted behind `requireAuth`. Writes additionally require the admin role. */
export const doctorRouter = Router();
const adminOnly = requireRole('admin');

doctorRouter.get('/', validate(listDoctorsSchema), c.list);
doctorRouter.get('/facets', c.facets);
doctorRouter.get('/options', validate(doctorOptionsSchema), c.options);
doctorRouter.post('/', adminOnly, validate(createDoctorSchema), c.create);

doctorRouter.get('/:id', validate(doctorIdSchema), c.getOne);
doctorRouter.patch('/:id', adminOnly, validate(updateDoctorSchema), c.update);
doctorRouter.delete('/:id', adminOnly, validate(doctorIdSchema), c.remove);

doctorRouter.get('/:id/patients', validate(listPatientsOfDoctorSchema), c.listPatients);
doctorRouter.post('/:id/patients', adminOnly, validate(addPatientSchema), c.addPatient);
doctorRouter.delete('/:id/patients/:patientId', adminOnly, validate(doctorPatientParams), c.removePatient);
