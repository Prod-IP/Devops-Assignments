import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductsController } from '../src/products.controller';
import { ProductsService } from '../src/products.service';
import { GlobalExceptionFilter } from '@ecommerce/common';

describe('ProductsController', () => {
  let app: INestApplication;
  const mock = {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createUploadUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: mock }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    jest.clearAllMocks();
  });

  afterEach(async () => app.close());

  it('POST /v1/products → 201', async () => {
    mock.create.mockResolvedValue({
      productId: 'p1',
      name: 'Sku',
      price: 9.99,
      stock: 10,
      createdAt: 't',
      updatedAt: 't',
    });
    await request(app.getHttpServer())
      .post('/v1/products')
      .send({ name: 'Sku', price: 9.99, stock: 10 })
      .expect(201);
  });

  it('POST /v1/products invalid → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .send({ name: 'Sku' })
      .expect(400);
  });

  it('GET /v1/products/:id → 200', async () => {
    mock.get.mockResolvedValue({ productId: 'p1', name: 'Sku', price: 1, stock: 1 });
    await request(app.getHttpServer()).get('/v1/products/p1').expect(200);
  });
});
