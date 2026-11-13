import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

/**
 * Opens a single pooled connection that is reused for the lifetime of the
 * process (one Cloud Run instance = one pool). Never connect per request.
 */
export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose; // already connected (e.g. dev:memory)

  // `mongodb+srv://` needs an SRV DNS lookup; some local resolvers refuse those.
  if (env.DNS_SERVERS) {
    dns.setServers(env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  }

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

  const conn = await mongoose.connect(uri, {
    dbName: env.MONGODB_DB_NAME,
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
