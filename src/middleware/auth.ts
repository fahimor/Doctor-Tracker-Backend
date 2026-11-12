import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { verifyToken } from '../modules/auth/auth.service.js';
import type { Role } from '../modules/auth/auth.types.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Authentication: reads the JWT from the httpOnly session cookie (or an
 * `Authorization: Bearer` header for API clients such as Postman) and verifies it.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token: string | undefined = req.cookies?.[env.COOKIE_NAME] ?? bearer;

  if (!token) throw ApiError.unauthorized();
  req.user = verifyToken(token);
  next();
};

/** Authorization: only lets through users whose role is in `roles`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
}
