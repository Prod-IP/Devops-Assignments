import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth.controller';
import { AuthService } from '../src/auth.service';
import { GlobalExceptionFilter } from '@ecommerce/common';

describe('AuthController', () => {
  let app: INestApplication;
  const mockAuth = {
    register: jest.fn(),
    login: jest.fn(),
    getProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuth }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /v1/health → 200', () =>
    request(app.getHttpServer()).get('/v1/health').expect(200).expect({
      status: 'ok',
      service: 'auth',
    }));

  it('POST /v1/auth/register → 201-ish 200 with body', async () => {
    mockAuth.register.mockResolvedValue({ userId: 'u1', email: 'a@b.com' });
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'a@b.com', password: 'password1', name: 'Alice' })
      .expect(201)
      .expect({ userId: 'u1', email: 'a@b.com' });
  });

  it('POST /v1/auth/register invalid → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'bad' })
      .expect(400);
  });

  it('POST /v1/auth/login → 200', async () => {
    mockAuth.login.mockResolvedValue({ accessToken: 'tok' });
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'a@b.com', password: 'password1' })
      .expect(200)
      .expect({ accessToken: 'tok' });
  });

  it('GET /v1/auth/me without user → 401', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
  });
});
