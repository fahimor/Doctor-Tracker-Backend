import type { Request, Response } from 'express';
import { input } from '../../middleware/validate.js';
import { createPatientSchema, listPatientsSchema, patientIdSchema, updatePatientSchema } from './patient.schema.js';
import * as patientService from './patient.service.js';

export async function list(req: Request, res: Response) {
  const { query } = input(req, listPatientsSchema);
  res.json(await patientService.listPatients(query));
}

export async function getOne(req: Request, res: Response) {
  const { params } = input(req, patientIdSchema);
  res.json({ data: await patientService.getPatient(params.id) });
}

export async function create(req: Request, res: Response) {
  const { body } = input(req, createPatientSchema);
  res.status(201).json({ data: await patientService.createPatient(body) });
}

export async function update(req: Request, res: Response) {
  const { params, body } = input(req, updatePatientSchema);
  res.json({ data: await patientService.updatePatient(params.id, body) });
}

export async function remove(req: Request, res: Response) {
  const { params } = input(req, patientIdSchema);
  await patientService.deletePatient(params.id);
  res.status(204).end();
}
