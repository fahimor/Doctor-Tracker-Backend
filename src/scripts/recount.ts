/**
 * Rebuilds every doctor's denormalised `patientCount` from the patients
 * collection. The API keeps the counter in sync on every write; use this to
 * backfill existing data or repair it after editing the database by hand.
 *
 *   npm run db:recount          # local, uses MONGODB_URI from .env
 *   npm run db:recount:prod     # compiled version
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { recountPatientCounts } from '../modules/doctors/doctor.service.js';

async function run() {
  await connectDatabase();
  const { doctorsUpdated } = await recountPatientCounts();
  console.log(`Patient counts rebuilt; ${doctorsUpdated} doctor${doctorsUpdated === 1 ? '' : 's'} corrected.`);
  await disconnectDatabase();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
