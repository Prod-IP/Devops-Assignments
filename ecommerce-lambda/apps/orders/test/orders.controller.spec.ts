import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OrdersController } from '../src/orders.controller';
import { OrdersService } from '../src/orders.service';
import { GlobalExceptionFilter } from '@ecommerce/common';

describe('OrdersController', () => {
  let app: INestApplication;
  const mock = {
    create: jest.fn(),
    get: jest.fn(),
    listByUser: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mock }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    jest.clearAllMocks();
  });

  afterEach(async () => app.close());

  it('POST /v1/orders without auth → 401', () =>
    request(app.getHttpServer())
      .post('/v1/orders')
      .send({
        items: [{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
        shippingAddress: {
          line1: '1 St',
          city: 'X',
          state: 'Y',
          postalCode: '1',
          country: 'US',
        },
      })
      .expect(401));

  it('POST /v1/orders → 201', async () => {
    mock.create.mockResolvedValue({ orderId: 'o1', status: 'PENDING' });
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('x-user-id', 'u1')
      .send({
        items: [{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
        shippingAddress: {
          line1: '1 St',
          city: 'X',
          state: 'Y',
          postalCode: '1',
          country: 'US',
        },
        idempotencyKey: 'key-12345678',
      })
      .expect(201);
  });

  it('PATCH status non-admin → 403', async () => {
    await request(app.getHttpServer())
      .patch('/v1/orders/o1/status')
      .set('x-user-id', 'u1')
      .set('x-user-role', 'user')
      .send({ status: 'SHIPPED' })
      .expect(403);
  });
});
