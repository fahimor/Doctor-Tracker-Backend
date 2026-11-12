/**
 * Zero-setup local run: starts an in-memory MongoDB, seeds it, then boots the
 * API against it. Data is lost when the process stops.
 *
 *   npm run dev:memory
 */
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Reuse the binary that `npm install` cached inside backend/node_modules,
// even when this script is started from another working directory.
process.env.MONGOMS_DOWNLOAD_DIR ??= fileURLToPath(new URL('../../node_modules/.cache/mongodb-memory-server', import.meta.url));

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('doctor-tracker');
process.env.JWT_SECRET ??= 'local-dev-secret-change-me-local-dev-secret';

const { connectDatabase } = await import('../config/db.js');
const { seedDatabase, DEMO_USERS } = await import('./seed-data.js');

await connectDatabase();
const result = await seedDatabase();
console.log(`In-memory MongoDB seeded with ${result.doctors} doctors / ${result.patients} patients`);
for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(6)}  ${u.email}  /  ${u.password}`);

// server.ts reuses the already-open mongoose connection.
await import('../server.js');

const stop = async () => {
  await mongo.stop();
};
process.on('exit', () => void stop());
