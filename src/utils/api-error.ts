export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** An error that is safe to send to the client as-is. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(resource = 'Resource') {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
}
