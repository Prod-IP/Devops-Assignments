import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CartController } from '../src/cart.controller';
import { CartService } from '../src/cart.service';
import { GlobalExceptionFilter } from '@ecommerce/common';

describe('CartController', () => {
  let app: INestApplication;
  const mock = {
    get: jest.fn().mockResolvedValue({ userId: 'u1', items: [] }),
    addItem: jest.fn().mockResolvedValue({ userId: 'u1', items: [{ productId: 'p1', quantity: 1 }] }),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: mock }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => app.close());

  it('GET /v1/cart without auth → 401', () =>
    request(app.getHttpServer()).get('/v1/cart').expect(401));

  it('POST /v1/cart/items → 201', async () => {
    await request(app.getHttpServer())
      .post('/v1/cart/items')
      .set('x-user-id', 'u1')
      .send({ productId: '11111111-1111-1111-1111-111111111111', quantity: 1 })
      .expect(201);
  });

  it('POST invalid → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/cart/items')
      .set('x-user-id', 'u1')
      .send({ productId: 'bad', quantity: 0 })
      .expect(400);
  });
});
