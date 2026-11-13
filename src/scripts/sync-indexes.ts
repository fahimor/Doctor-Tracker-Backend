/**
 * Makes the database's indexes match the schemas exactly:
 * creates missing ones and drops indexes no longer defined in code.
 *
 * Mongoose's automatic index creation only ever adds indexes, so run this
 * after changing any `schema.index(...)` definition:
 *
 *   npm run db:indexes          # local, uses MONGODB_URI from .env
 *   npm run db:indexes:prod     # compiled version, e.g. from CI
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Doctor } from '../modules/doctors/doctor.model.js';
import { Patient } from '../modules/patients/patient.model.js';
import { User } from '../modules/users/user.model.js';

async function run() {
  await connectDatabase();
  for (const model of [User, Doctor, Patient]) {
    const dropped = await model.syncIndexes();
    const current = (await model.collection.indexes()).map((i) => i.name);
    console.log(`${model.modelName}: ${current.length} indexes${dropped.length ? `, dropped ${dropped.join(', ')}` : ''}`);
  }
  await disconnectDatabase();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
