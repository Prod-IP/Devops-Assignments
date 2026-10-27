import { CartService } from '../src/cart.service';

const store = new Map<string, any>();

jest.mock('@ecommerce/db', () => ({
  Repository: class {
    async put(item: any) {
      store.set(`${item.PK}|${item.SK}`, item);
      return item;
    }
    async get(pk: string, sk: string) {
      return store.get(`${pk}|${sk}`) || null;
    }
    async delete(pk: string, sk: string) {
      store.delete(`${pk}|${sk}`);
    }
  },
}));

describe('CartService', () => {
  const svc = new CartService();
  beforeEach(() => store.clear());

  it('adds, removes, and clears items', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    let cart = await svc.addItem('u1', { productId: pid, quantity: 2 });
    expect(cart.items[0].quantity).toBe(2);
    cart = await svc.addItem('u1', { productId: pid, quantity: 1 });
    expect(cart.items[0].quantity).toBe(3);
    cart = await svc.removeItem('u1', pid);
    expect(cart.items).toHaveLength(0);
    cart = await svc.clear('u1');
    expect(cart.items).toHaveLength(0);
  });
});
