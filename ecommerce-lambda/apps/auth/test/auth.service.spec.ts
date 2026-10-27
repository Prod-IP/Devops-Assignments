import { AuthService } from '../src/auth.service';

jest.mock('@ecommerce/db', () => {
  const store = new Map<string, any>();
  return {
    Repository: class {
      async put(item: any) {
        store.set(`${item.PK}|${item.SK}`, item);
        return item;
      }
      async get(pk: string, sk: string) {
        return store.get(`${pk}|${sk}`) || null;
      }
      async query() {
        return Array.from(store.values());
      }
    },
  };
});

describe('AuthService', () => {
  const svc = new AuthService();

  it('registers and logs in locally', async () => {
    delete process.env.COGNITO_CLIENT_ID;
    const reg = await svc.register({
      email: 'bob@example.com',
      password: 'password1',
      name: 'Bob',
    });
    expect(reg.email).toBe('bob@example.com');
    const login = await svc.login({ email: 'bob@example.com', password: 'password1' });
    expect(login.accessToken).toMatch(/^local\./);
  });
});
