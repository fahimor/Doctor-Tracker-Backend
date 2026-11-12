import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/api-error.js';
import { User } from '../users/user.model.js';
import type { AuthUser, Role } from './auth.types.js';

const BCRYPT_ROUNDS = 12;
const JWT_ISSUER = 'doctor-tracker-api';
const JWT_AUDIENCE = 'doctor-tracker-web';

// Used to keep response time the same whether or not the email exists,
// so attackers cannot enumerate accounts by timing the login endpoint.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-protection', BCRYPT_ROUNDS);

interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = { sub: user.id, email: user.email, name: user.name, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_TTL_SECONDS,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as TokenPayload;
    return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  return { id: String(user._id), email: user.email, name: user.name, role: user.role };
}

export async function getUserById(id: string): Promise<AuthUser> {
  const user = await User.findById(id).lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  return { id: String(user._id), email: user.email, name: user.name, role: user.role };
}

/** Creates the first admin from env vars so a fresh Cloud Run deploy is usable. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } = env;
  if (!email || !password) return;

  const exists = await User.exists({ email: email.toLowerCase() });
  if (exists) return;

  await User.create({
    name: env.BOOTSTRAP_ADMIN_NAME,
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  logger.info({ email }, 'Bootstrap admin user created');
}
