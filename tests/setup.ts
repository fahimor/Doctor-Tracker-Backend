import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

// Must be set before src/config/env.ts is imported by the app.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.MONGODB_URI = 'mongodb://placeholder'; // real URI is set below

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('doctor-tracker-test'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
