import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load a local .env file in development. On Cloud Run, env vars / secrets are
// injected by the platform, so no file exists and this is skipped.
if (existsSync('.env') && process.env.NODE_ENV !== 'test') {
  process.loadEnvFile('.env');
}

const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().optional(),
  /**
   * Optional comma-separated DNS servers for Node's resolver. Only needed when
   * the local resolver refuses SRV lookups for `mongodb+srv://` URIs
   * (error: "querySrv ECONNREFUSED"). Not needed on Cloud Run.
   */
  DNS_SERVERS: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 12), // 12h

  /** Comma separated list of allowed browser origins (CORS). */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  COOKIE_NAME: z.string().default('dt_session'),
  /** "lax" works when the frontend proxies /api through its own domain (recommended). */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Defaults to true in production. */
  COOKIE_SECURE: booleanString.optional(),

  /** Number of proxy hops to trust for client IPs (Cloud Run = 1, + Vercel rewrite = 2). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  /** Optional: create this admin on boot if no user with the email exists. */
  BOOTSTRAP_ADMIN_EMAIL: z.email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().default('Administrator'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  cookieSecure: raw.COOKIE_SECURE ?? raw.NODE_ENV === 'production',
};
