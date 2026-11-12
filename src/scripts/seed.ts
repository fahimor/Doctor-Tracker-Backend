/**
 * Seeds demo data: 2 users (admin + viewer), doctors and patients.
 * WARNING: wipes the doctors and patients collections first.
 *
 *   npm run seed                 # local, uses MONGODB_URI from .env
 *   npm run seed -- --force      # required when NODE_ENV=production
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { DEMO_USERS, seedDatabase } from './seed-data.js';

async function run() {
  if (env.isProduction && !process.argv.includes('--force')) {
    console.error('Refusing to wipe a production database. Re-run with --force if you are sure.');
    process.exit(1);
  }

  await connectDatabase();
  const started = Date.now();
  const result = await seedDatabase();
  await disconnectDatabase();

  console.log(`\nSeeded ${result.doctors} doctors and ${result.patients} patients in ${Date.now() - started}ms`);
  console.log('\nDemo accounts:');
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(6)}  ${u.email}  /  ${u.password}`);
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
