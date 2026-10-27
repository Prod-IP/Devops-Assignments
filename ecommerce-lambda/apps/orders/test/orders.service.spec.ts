import { OrdersService } from '../src/orders.service';

const store = new Map<string, any>();
const published: any[] = [];

jest.mock('@ecommerce/db', () => ({
  Repository: class {
    constructor(private table: string) {}
    async put(item: any) {
      store.set(`${this.table}|${item.PK}|${item.SK}`, item);
      return item;
    }
    async get(pk: string, sk: string) {
      return store.get(`${this.table}|${pk}|${sk}`) || null;
    }
    async query() {
      return [];
    }
    async update() {
      return null;
    }
  },
}));

jest.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: class {
    async send(cmd: any) {
      published.push(cmd);
      return {};
    }
  },
  PutEventsCommand: class {
    constructor(public input: any) {}
  },
}));

describe('OrdersService idempotency', () => {
  const svc = new OrdersService();

  beforeEach(() => {
    store.clear();
    published.length = 0;
  });

  it('returns same order for duplicate idempotency key', async () => {
    const input = {
      items: [{ productId: '11111111-1111-1111-1111-111111111111', quantity: 2 }],
      shippingAddress: {
        line1: '1',
        city: 'A',
        state: 'B',
        postalCode: '1',
        country: 'US',
      },
      idempotencyKey: 'idem-abc-123',
    };
    const first = await svc.create('user-1', input);
    const second = await svc.create('user-1', input);
    expect(second.orderId).toBe(first.orderId);
    expect(published.length).toBe(1);
  });
});
