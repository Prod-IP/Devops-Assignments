import { AdminService } from '../src/admin.service';

jest.mock('@ecommerce/db', () => ({
  Repository: class {
    async scan() {
      return [
        {
          orderId: 'o1',
          userId: 'u1',
          status: 'PENDING',
          total: 10,
          createdAt: 't',
          SK: 'METADATA',
        },
      ];
    }
  },
}));

describe('AdminService', () => {
  const svc = new AdminService();

  it('builds dashboard totals', async () => {
    const dash = await svc.dashboard();
    expect(dash.totals.orders).toBe(1);
    expect(dash.totals.revenue).toBe(10);
  });
});
