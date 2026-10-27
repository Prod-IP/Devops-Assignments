export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'Invalid request', code = 'BAD_REQUEST') =>
  new AppError(400, message, code);

export const unauthorized = (message = 'Unauthorized', code = 'UNAUTHORIZED') =>
  new AppError(401, message, code);

export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN') =>
  new AppError(403, message, code);

export const notFound = (message = 'Not found', code = 'NOT_FOUND') =>
  new AppError(404, message, code);

export const conflict = (message = 'Conflict', code = 'CONFLICT') =>
  new AppError(409, message, code);

export function createResponse(
  statusCode: number,
  body: unknown,
  requestId?: string,
): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
    },
    body: JSON.stringify(body),
  };
}
