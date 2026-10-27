import {
  AppError,
  badRequest,
  createResponse,
  unauthorized,
  notFound,
  ZodValidationPipe,
  CreateProductSchema,
} from '../src';
import { BadRequestException } from '@nestjs/common';

describe('common package', () => {
  it('creates AppError helpers', () => {
    expect(badRequest().statusCode).toBe(400);
    expect(unauthorized().statusCode).toBe(401);
    expect(notFound().statusCode).toBe(404);
    expect(new AppError(418, 'teapot').message).toBe('teapot');
  });

  it('createResponse includes request id', () => {
    const res = createResponse(200, { ok: true }, 'rid');
    expect(res.headers['X-Request-Id']).toBe('rid');
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('ZodValidationPipe accepts valid and rejects invalid', () => {
    const pipe = new ZodValidationPipe(CreateProductSchema);
    expect(pipe.transform({ name: 'A', price: 1, stock: 1 })).toMatchObject({ name: 'A' });
    expect(() => pipe.transform({ name: 'A' })).toThrow(BadRequestException);
  });
});
