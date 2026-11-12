import type { Request, Response } from 'express';
import { input } from '../../middleware/validate.js';
import { listPatientsSchema, patientBodyWithoutDoctor } from '../patients/patient.schema.js';
import * as patientService from '../patients/patient.service.js';
import {
  createDoctorSchema,
  doctorIdSchema,
  doctorOptionsSchema,
  doctorPatientParams,
  listDoctorsSchema,
  updateDoctorSchema,
} from './doctor.schema.js';
import * as doctorService from './doctor.service.js';

export async function list(req: Request, res: Response) {
  const { query } = input(req, listDoctorsSchema);
  res.json(await doctorService.listDoctors(query));
}

export async function facets(_req: Request, res: Response) {
  res.json({ data: await doctorService.getDoctorFacets() });
}

export async function options(req: Request, res: Response) {
  const { query } = input(req, doctorOptionsSchema);
  res.json({ data: await doctorService.getDoctorOptions(query.q, query.limit) });
}

export async function getOne(req: Request, res: Response) {
  const { params } = input(req, doctorIdSchema);
  res.json({ data: await doctorService.getDoctor(params.id) });
}

export async function create(req: Request, res: Response) {
  const { body } = input(req, createDoctorSchema);
  res.status(201).json({ data: await doctorService.createDoctor(body) });
}

export async function update(req: Request, res: Response) {
  const { params, body } = input(req, updateDoctorSchema);
  res.json({ data: await doctorService.updateDoctor(params.id, body) });
}

export async function remove(req: Request, res: Response) {
  const { params } = input(req, doctorIdSchema);
  res.json({ data: await doctorService.deleteDoctor(params.id) });
}

/* ---------- Nested: /doctors/:id/patients ---------- */

export const listPatientsOfDoctorSchema = { params: doctorIdSchema.params, query: listPatientsSchema.query };

export async function listPatients(req: Request, res: Response) {
  const { params, query } = input(req, listPatientsOfDoctorSchema);
  res.json(await patientService.listPatients({ ...query, doctor: params.id }));
}

export const addPatientSchema = { params: doctorIdSchema.params, body: patientBodyWithoutDoctor };

export async function addPatient(req: Request, res: Response) {
  const { params, body } = input(req, addPatientSchema);
  res.status(201).json({ data: await patientService.createPatient({ ...body, doctor: params.id }) });
}

export async function removePatient(req: Request, res: Response) {
  const { params } = input(req, doctorPatientParams);
  await patientService.deletePatient(params.patientId, params.id);
  res.status(204).end();
}
