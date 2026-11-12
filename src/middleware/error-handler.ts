import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/api-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
};

function isDuplicateKeyError(err: unknown): err is { code: number; keyValue?: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/** Converts any thrown error into a consistent `{ error: { code, message, details } }` body. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = new ApiError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  } else if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    apiError = ApiError.conflict(`A record with this ${field} already exists`, [
      { path: field, message: `This ${field} is already in use` },
    ]);
  } else if (err instanceof mongoose.Error.ValidationError) {
    apiError = new ApiError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    apiError = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if (err?.type === 'entity.parse.failed') {
    apiError = ApiError.badRequest('Malformed JSON body');
  } else if (err?.type === 'entity.too.large') {
    apiError = new ApiError(413, 'BAD_REQUEST', 'Request body is too large');
  } else {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error');
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  });
};
