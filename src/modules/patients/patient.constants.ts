export const PATIENT_CONDITIONS = [
  'stable',
  'critical',
  'recovering',
  'under_observation',
  'discharged',
] as const;
export type PatientCondition = (typeof PATIENT_CONDITIONS)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];
