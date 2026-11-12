import { Types } from 'mongoose';
import { Doctor, doctorSearchTokens } from '../modules/doctors/doctor.model.js';
import { GENDERS } from '../modules/patients/patient.constants.js';
import { Patient, patientSearchTokens } from '../modules/patients/patient.model.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { User } from '../modules/users/user.model.js';
import { startOfUtcDay } from '../utils/dates.js';

/** Deterministic PRNG so every seed produces the same demo data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE_FIRST = ['Rahim', 'Karim', 'Tanvir', 'Arif', 'Imran', 'Sakib', 'Nayeem', 'Fahim', 'Mahmud', 'Rafiq', 'Jamal', 'Hasan', 'Shafiq', 'Zahid', 'Asif', 'Mehedi', 'Rakib', 'Sohel', 'Tareq', 'Habib'];
const FEMALE_FIRST = ['Nusrat', 'Farhana', 'Sadia', 'Tasnim', 'Ayesha', 'Shirin', 'Rumana', 'Jannat', 'Mim', 'Sabrina', 'Nadia', 'Lamia', 'Taslima', 'Rokeya', 'Sharmin', 'Fatema', 'Maliha', 'Anika', 'Tahmina', 'Sumaiya'];
const LAST = ['Ahmed', 'Hossain', 'Rahman', 'Islam', 'Chowdhury', 'Khan', 'Uddin', 'Akter', 'Sarker', 'Haque', 'Karim', 'Talukder', 'Mia', 'Siddique', 'Bhuiyan', 'Alam', 'Majumder', 'Biswas', 'Das', 'Roy'];

const SPECIALIZATIONS = ['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Dermatology', 'Oncology', 'Gynecology', 'Endocrinology', 'Gastroenterology', 'Psychiatry', 'Nephrology', 'Pulmonology', 'ENT', 'General Medicine'];

const HOSPITALS = [
  'Dhaka Medical College Hospital',
  'Square Hospital',
  'Evercare Hospital Dhaka',
  'United Hospital',
  'Labaid Specialized Hospital',
  'BIRDEM General Hospital',
  'Ibn Sina Hospital',
  'Chattogram Medical College Hospital',
  'Popular Medical College Hospital',
  'Sylhet MAG Osmani Medical College Hospital',
];

const DIAGNOSES: Record<string, string[]> = {
  Cardiology: ['Hypertension', 'Coronary artery disease', 'Arrhythmia', 'Heart failure'],
  Neurology: ['Migraine', 'Epilepsy', 'Stroke recovery', 'Parkinson disease'],
  Orthopedics: ['Fractured tibia', 'Osteoarthritis', 'Lumbar disc herniation', 'ACL tear'],
  Pediatrics: ['Bronchiolitis', 'Dengue fever', 'Asthma', 'Malnutrition'],
  Dermatology: ['Psoriasis', 'Eczema', 'Acne vulgaris', 'Fungal infection'],
  Oncology: ['Breast cancer', 'Lung cancer', 'Leukemia', 'Lymphoma'],
  Gynecology: ['Prenatal care', 'PCOS', 'Endometriosis', 'Gestational diabetes'],
  Endocrinology: ['Type 2 diabetes', 'Hypothyroidism', 'Hyperthyroidism', 'Obesity'],
  Gastroenterology: ['Peptic ulcer', 'Hepatitis B', 'IBS', 'Fatty liver'],
  Psychiatry: ['Depression', 'Anxiety disorder', 'Bipolar disorder', 'Insomnia'],
  Nephrology: ['Chronic kidney disease', 'Kidney stones', 'Nephrotic syndrome'],
  Pulmonology: ['COPD', 'Pneumonia', 'Tuberculosis', 'Asthma'],
  ENT: ['Sinusitis', 'Tonsillitis', 'Otitis media', 'Hearing loss'],
  'General Medicine': ['Typhoid fever', 'Dengue fever', 'Viral fever', 'Gastroenteritis'],
};

export const DEMO_USERS = [
  { name: 'Admin User', email: 'admin@doctortracker.dev', password: 'Admin@12345', role: 'admin' as const },
  { name: 'Viewer User', email: 'viewer@doctortracker.dev', password: 'Viewer@12345', role: 'viewer' as const },
];

export interface SeedOptions {
  doctors?: number;
  patients?: number;
  seed?: number;
}

export async function seedDatabase({ doctors: doctorCount = 48, patients: patientCount = 1600, seed = 42 }: SeedOptions = {}) {
  const rand = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const phone = () => `+8801${pick(['3', '5', '6', '7', '8', '9'])}${String(int(10_000_000, 99_999_999))}`;
  const today = startOfUtcDay(new Date());
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);
  const ageInDays = (date: Date) => Math.floor((today.getTime() - startOfUtcDay(date).getTime()) / 86_400_000);
  // A plausible time of day on that date, but never in the future.
  const now = Date.now();
  const atWorkingHour = (day: Date) => new Date(Math.min(now, day.getTime() + int(3, 12) * 3_600_000 + int(0, 59) * 60_000));

  // Make sure indexes exist before bulk-inserting (also enforces unique email).
  await Promise.all([User.syncIndexes(), Doctor.syncIndexes(), Patient.syncIndexes()]);
  await Promise.all([Doctor.deleteMany({}), Patient.deleteMany({})]);

  for (const u of DEMO_USERS) {
    await User.updateOne(
      { email: u.email },
      { $set: { name: u.name, role: u.role, passwordHash: await hashPassword(u.password) } },
      { upsert: true },
    );
  }

  const usedEmails = new Set<string>();
  const doctors = Array.from({ length: doctorCount }, (_, i) => {
    const female = rand() < 0.45;
    const first = pick(female ? FEMALE_FIRST : MALE_FIRST);
    const last = pick(LAST);
    let email = `${first}.${last}`.toLowerCase() + '@careguide.health';
    if (usedEmails.has(email)) email = `${first}.${last}${i}`.toLowerCase() + '@careguide.health';
    usedEmails.add(email);

    // Most doctors joined 4–20 months ago; ~15% are recent hires (last 90 days).
    const joinedDaysAgo = rand() < 0.15 ? int(2, 90) : int(120, 600);
    const createdAt = atWorkingHour(daysAgo(joinedDaysAgo));
    const doc = {
      _id: new Types.ObjectId(),
      name: `Dr. ${first} ${last}`,
      specialization: pick(SPECIALIZATIONS),
      hospital: pick(HOSPITALS),
      phone: phone(),
      email,
      createdAt,
      updatedAt: createdAt,
    };
    return { ...doc, searchTokens: doctorSearchTokens(doc) };
  });

  // Skewed workload: some doctors are much busier than others, and recent
  // hires have not built up a full caseload yet.
  const weights = doctors.map((d) => (0.3 + Math.pow(rand(), 2) * 3) * Math.min(1, ageInDays(d.createdAt) / 180));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pickDoctor = () => {
    let r = rand() * totalWeight;
    for (let i = 0; i < doctors.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return doctors[i]!;
    }
    return doctors[doctors.length - 1]!;
  };

  const conditionWeights: [string, number][] = [
    ['stable', 0.38],
    ['recovering', 0.24],
    ['under_observation', 0.16],
    ['discharged', 0.14],
    ['critical', 0.08],
  ];
  const pickCondition = () => {
    let r = rand();
    for (const [c, w] of conditionWeights) {
      r -= w;
      if (r <= 0) return c;
    }
    return 'stable';
  };

  const patients = Array.from({ length: patientCount }, () => {
    const doctor = pickDoctor();
    const gender = rand() < 0.02 ? GENDERS[2] : rand() < 0.5 ? GENDERS[0] : GENDERS[1];
    const first = pick(gender === 'female' ? FEMALE_FIRST : MALE_FIRST);
    const last = pick(LAST);
    const age = doctor.specialization === 'Pediatrics' ? int(0, 16) : Math.min(95, Math.max(1, Math.round(18 + rand() * 50 + (rand() - 0.5) * 30)));
    // Admissions over the last ~13 months (never before the doctor joined).
    // `1 - sqrt(u)` gives a density that rises linearly towards today: steady growth.
    const span = Math.min(400, ageInDays(doctor.createdAt));
    const admissionDate = daysAgo(Math.floor(span * (1 - Math.sqrt(rand()))));
    const createdAt = atWorkingHour(admissionDate);
    const hasEmail = rand() < 0.6;
    const doc = {
      name: `${first} ${last}`,
      age,
      gender,
      phone: phone(),
      email: hasEmail ? `${first}.${last}${int(1, 999)}`.toLowerCase() + '@gmail.com' : undefined,
      diagnosis: pick(DIAGNOSES[doctor.specialization] ?? ['General checkup']),
      condition: pickCondition(),
      admissionDate,
      doctor: doctor._id,
      createdAt,
      updatedAt: createdAt,
    };
    return { ...doc, searchTokens: patientSearchTokens(doc) };
  });

  // insertMany skips save hooks, which is why searchTokens are computed above.
  await Doctor.insertMany(doctors, { timestamps: false });
  for (let i = 0; i < patients.length; i += 500) {
    await Patient.insertMany(patients.slice(i, i + 500), { timestamps: false });
  }

  return { users: DEMO_USERS.length, doctors: doctors.length, patients: patients.length };
}

