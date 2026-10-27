import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from '../src/admin.controller';
import { AdminService } from '../src/admin.service';
import { GlobalExceptionFilter } from '@ecommerce/common';

describe('AdminController', () => {
  let app: INestApplication;
  const mock = {
    dashboard: jest.fn().mockResolvedValue({ totals: { orders: 1 } }),
    listUsers: jest.fn().mockResolvedValue([]),
    listOrders: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mock }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => app.close());

  it('GET /v1/admin/dashboard non-admin → 403', () =>
    request(app.getHttpServer())
      .get('/v1/admin/dashboard')
      .set('x-user-role', 'user')
      .expect(403));

  it('GET /v1/admin/dashboard admin → 200', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/dashboard')
      .set('x-user-role', 'admin')
      .expect(200);
  });
});
