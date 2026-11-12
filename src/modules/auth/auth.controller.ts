import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { input } from '../../middleware/validate.js';
import { loginSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true, // not readable from JS -> safe from XSS token theft
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    maxAge: env.JWT_TTL_SECONDS * 1000,
  };
}

export async function login(req: Request, res: Response) {
  const { body } = input(req, loginSchema);
  const user = await authService.login(body.email, body.password);
  const token = authService.signToken(user);

  res.cookie(env.COOKIE_NAME, token, cookieOptions());
  res.json({ data: { user, expiresIn: env.JWT_TTL_SECONDS } });
}

export function logout(_req: Request, res: Response) {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(env.COOKIE_NAME, options);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await authService.getUserById(req.user!.id);
  res.json({ data: { user } });
}
