import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AppError } from './errors';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof AppError) {
      return res.status(exception.statusCode).json({
        error: exception.code || 'ERROR',
        message: exception.message,
      });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return res.status(status).json(typeof body === 'string' ? { message: body } : body);
    }
    console.error(exception);
    return res.status(500).json({ error: 'INTERNAL', message: 'Internal server error' });
  }
}

export async function createNestHttpApp(module: any) {
  const app = await NestFactory.create(module, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('v1');
  app.enableCors();
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}
