import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;
let admin: ReturnType<typeof request.agent>;
let viewer: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  const { seedDatabase } = await import('../src/scripts/seed-data.js');
  await seedDatabase({ doctors: 12, patients: 240, seed: 7 });
  app = createApp();

  admin = request.agent(app);
  viewer = request.agent(app);
  await admin.post('/api/auth/login').send({ email: 'admin@doctortracker.dev', password: 'Admin@12345' }).expect(200);
  await viewer.post('/api/auth/login').send({ email: 'viewer@doctortracker.dev', password: 'Viewer@12345' }).expect(200);
});

describe('health & auth', () => {
  it('reports health', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('rejects unauthenticated API calls', async () => {
    const res = await request(app).get('/api/doctors').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@doctortracker.dev', password: 'nope' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('validates login input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(['email', 'password']);
  });

  it('sets an httpOnly session cookie on login and resolves /me', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@doctortracker.dev', password: 'Admin@12345' })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/dt_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(res.body.data.user).toMatchObject({ email: 'admin@doctortracker.dev', role: 'admin' });

    const me = await admin.get('/api/auth/me').expect(200);
    expect(me.body.data.user.role).toBe('admin');
  });

  it('rejects a tampered token', async () => {
    await request(app).get('/api/doctors').set('Cookie', 'dt_session=abc.def.ghi').expect(401);
  });
});

describe('doctors', () => {
  it('paginates with stable meta and includes patient counts', async () => {
    const res = await admin.get('/api/doctors?page=2&limit=5').expect(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 5, total: 12, totalPages: 3, hasNextPage: true, hasPrevPage: true });
    expect(typeof res.body.data[0].patientCount).toBe('number');
    expect(res.body.data[0].searchTokens).toBeUndefined();
  });

  it('searches by word prefixes across fields', async () => {
    const all = await admin.get('/api/doctors?limit=100').expect(200);
    const target = all.body.data[3];
    const lastName = target.name.split(' ').at(-1) as string;
    const q = `${lastName.slice(0, 3)} ${target.specialization.slice(0, 4)}`;

    const res = await admin.get(`/api/doctors?q=${encodeURIComponent(q)}`).expect(200);
    expect(res.body.data.map((d: { _id: string }) => d._id)).toContain(target._id);
    for (const d of res.body.data) {
      expect(d.specialization).toBe(target.specialization);
    }
  });

  it('filters by specialization and join date', async () => {
    const facets = await admin.get('/api/doctors/facets').expect(200);
    const spec = facets.body.data.specializations[0];
    const res = await admin.get(`/api/doctors?specialization=${encodeURIComponent(spec)}&limit=100`).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((d: { specialization: string }) => d.specialization === spec)).toBe(true);

    await admin.get('/api/doctors?from=2030-01-01').expect(200).expect((r) => expect(r.body.meta.total).toBe(0));
    await admin.get('/api/doctors?from=2026-02-01&to=2026-01-01').expect(400);
  });

  it('lets admins create, update and delete doctors', async () => {
    const payload = { name: 'Dr. Test Person', specialization: 'Cardiology', hospital: 'Test Hospital', phone: '+8801711111111', email: 'test.person@example.com' };
    const created = await admin.post('/api/doctors').send(payload).expect(201);
    expect(created.body.data).toMatchObject({ ...payload, stats: { totalPatients: 0 } });

    const dup = await admin.post('/api/doctors').send(payload).expect(409);
    expect(dup.body.error.details[0].path).toBe('email');

    const id = created.body.data._id;
    await admin.patch(`/api/doctors/${id}`).send({ hospital: 'Renamed Hospital' }).expect(200);
    const found = await admin.get('/api/doctors?q=renamed').expect(200);
    expect(found.body.data[0]._id).toBe(id);

    await admin.delete(`/api/doctors/${id}`).expect(200);
    await admin.get(`/api/doctors/${id}`).expect(404);
  });

  it('returns field-level validation errors', async () => {
    const res = await admin.post('/api/doctors').send({ name: 'A', email: 'bad', phone: 'abc' }).expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'specialization', 'hospital']));
  });

  it('forbids viewers from writing but allows reading', async () => {
    await viewer.get('/api/doctors').expect(200);
    const res = await viewer.post('/api/doctors').send({}).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects malformed ids', async () => {
    await admin.get('/api/doctors/not-an-id').expect(400);
  });
});

describe("a doctor's patients", () => {
  it('adds, lists and removes patients under a doctor', async () => {
    const doctors = await admin.get('/api/doctors?limit=1').expect(200);
    const doctorId = doctors.body.data[0]._id;
    const before = doctors.body.data[0].patientCount;

    const created = await admin
      .post(`/api/doctors/${doctorId}/patients`)
      .send({ name: 'Nested Patient', age: 40, gender: 'female', phone: '01811111111', diagnosis: 'Migraine', condition: 'stable', admissionDate: '2026-01-15' })
      .expect(201);
    expect(created.body.data.doctor._id).toBe(doctorId);
    expect(created.body.data.admissionDate).toBe('2026-01-15T00:00:00.000Z');

    const list = await admin.get(`/api/doctors/${doctorId}/patients?limit=100`).expect(200);
    expect(list.body.meta.total).toBe(before + 1);
    expect(list.body.data.every((p: { doctor: { _id: string } }) => p.doctor._id === doctorId)).toBe(true);

    const other = await admin.get('/api/doctors?limit=2').expect(200);
    const otherId = other.body.data[1]._id;
    // Cannot delete through a different doctor's URL
    await admin.delete(`/api/doctors/${otherId}/patients/${created.body.data._id}`).expect(404);
    await admin.delete(`/api/doctors/${doctorId}/patients/${created.body.data._id}`).expect(204);
  });
});

describe('patients', () => {
  it('filters by condition, gender, age and admission date', async () => {
    const res = await admin.get('/api/patients?condition=critical,recovering&gender=male&minAge=20&maxAge=70&from=2025-01-01&limit=100').expect(200);
    for (const p of res.body.data) {
      expect(['critical', 'recovering']).toContain(p.condition);
      expect(p.gender).toBe('male');
      expect(p.age).toBeGreaterThanOrEqual(20);
      expect(p.age).toBeLessThanOrEqual(70);
      expect(p.doctor.name).toBeTruthy();
    }
  });

  it('sorts by name', async () => {
    const res = await admin.get('/api/patients?sort=name_asc&limit=20').expect(200);
    const names = res.body.data.map((p: { name: string }) => p.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('updates a patient and refreshes search tokens', async () => {
    const page = await admin.get('/api/patients?limit=1').expect(200);
    const id = page.body.data[0]._id;
    await admin.patch(`/api/patients/${id}`).send({ diagnosis: 'Zygomycosis', condition: 'critical' }).expect(200);
    const found = await admin.get('/api/patients?q=zygo').expect(200);
    expect(found.body.data.map((p: { _id: string }) => p._id)).toContain(id);
    expect(found.body.data[0].condition).toBe('critical');
  });

  it('rejects future admission dates and unknown doctors', async () => {
    const res = await admin
      .post('/api/patients')
      .send({ name: 'Future', age: 30, gender: 'male', phone: '01711111111', diagnosis: 'X ray', condition: 'stable', admissionDate: '2999-01-01', doctor: '64b7f0000000000000000000' })
      .expect(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('admissionDate');

    await admin
      .post('/api/patients')
      .send({ name: 'Ghost', age: 30, gender: 'male', phone: '01711111111', diagnosis: 'X ray', condition: 'stable', admissionDate: '2026-01-01', doctor: '64b7f0000000000000000000' })
      .expect(400);
  });
});

describe('dashboard', () => {
  it('returns aggregated statistics', async () => {
    const res = await admin.get('/api/dashboard/stats?range=12m').expect(200);
    const s = res.body.data;
    expect(s.totals.doctors).toBe(12);
    expect(s.totals.patients).toBeGreaterThanOrEqual(240);
    expect(s.admissionsTrend).toHaveLength(12);
    expect(s.patientsByCondition.reduce((a: number, c: { count: number }) => a + c.count, 0)).toBe(s.totals.patients);
    expect(s.patientsPerDoctor.length).toBeLessThanOrEqual(10);
    expect(s.patientsPerDoctor[0].count).toBeGreaterThanOrEqual(s.patientsPerDoctor.at(-1).count);
    expect(s.patientsByAge.length).toBeGreaterThan(0);

    const week = await admin.get('/api/dashboard/stats?range=7d').expect(200);
    expect(week.body.data.admissionsTrend).toHaveLength(7);
    await admin.get('/api/dashboard/stats?range=5y').expect(400);
  });
});

describe('query plans', () => {
  it('uses indexes for search, filters and sorting', async () => {
    const { Doctor } = await import('../src/modules/doctors/doctor.model.js');
    const { Patient } = await import('../src/modules/patients/patient.model.js');
    const { buildSearchFilter } = await import('../src/utils/search.js');

    const plan = (explain: unknown) => JSON.stringify(explain);

    const search = await Doctor.find(buildSearchFilter('rah card')).explain('queryPlanner');
    expect(plan(search)).toContain('"indexName":"searchTokens_1"');

    const byCondition = await Patient.find({ condition: 'critical' }).sort({ admissionDate: -1 }).explain('queryPlanner');
    expect(plan(byCondition)).toContain('"indexName":"condition_1_admissionDate_-1"');
    expect(plan(byCondition)).not.toContain('"stage":"SORT"'); // no in-memory sort
  });
});
