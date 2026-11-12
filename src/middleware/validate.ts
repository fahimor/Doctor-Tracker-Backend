import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

type Schemas = {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
};

/**
 * Validates and coerces request input with Zod. Parsed values are written to
 * `req.valid` (Express 5 makes `req.query` read-only), so controllers only
 * ever touch typed, sanitised data. ZodErrors bubble to the error handler.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.valid = {
      body: schemas.body ? schemas.body.parse(req.body ?? {}) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}

/** Typed accessor for validated input inside a controller. */
export function input<T extends Schemas>(req: Request, _schemas: T) {
  return req.valid as {
    body: T['body'] extends z.ZodType ? z.output<T['body']> : undefined;
    query: T['query'] extends z.ZodType ? z.output<T['query']> : undefined;
    params: T['params'] extends z.ZodType ? z.output<T['params']> : undefined;
  };
}
